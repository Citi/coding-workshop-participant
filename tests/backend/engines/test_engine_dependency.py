"""Dependency engine: cycle detection, downstream depth, root causes, impact and levels (spec 9.1)."""

from __future__ import annotations

from types import SimpleNamespace

from engine_factories import T, make_deliverable, make_edge

from app.engines.dependency import (
    analyze_dependencies,
    downstream,
    edge_endpoints,
    find_cycle_path,
    is_overdue,
    is_root_cause,
    levels_as_columns,
    successor_map,
    topological_levels,
)
from app.engines.types import DependencyEdge, ImpactedItem

# Project Alpha's chain from spec section 10:
# 1 Requirements Sign-off -> 2 API Schema -> {3 Payments, 4 Mobile}; 3 Payments -> 5 End-to-End Testing.
ALPHA_EDGES = (make_edge(1, 2), make_edge(2, 3), make_edge(2, 4), make_edge(3, 5))


class TestEdgeShapes:
    """Edges may arrive as engine facts, ORM-like rows or plain tuples."""

    def test_every_supported_shape(self) -> None:
        assert edge_endpoints(DependencyEdge(id=7, predecessor_id=1, successor_id=2)) == (1, 2)
        assert edge_endpoints(SimpleNamespace(predecessor_deliverable_id=3, successor_deliverable_id=4)) == (3, 4)
        assert edge_endpoints((5, 6)) == (5, 6)
        assert edge_endpoints((99, 7, 8)) == (7, 8)

    def test_successor_map_sorts_and_deduplicates(self) -> None:
        assert successor_map([(1, 3), (1, 2), (1, 3), (2, 4)]) == {1: (2, 3), 2: (4,)}

    def test_cycle_check_accepts_mixed_shapes(self) -> None:
        rows = [(1, 2), (99, 2, 3), SimpleNamespace(predecessor_deliverable_id=3, successor_deliverable_id=5)]
        assert find_cycle_path(rows, 5, 1) == [1, 2, 3, 5, 1]


class TestFindCyclePath:
    """find_cycle_path: BFS from the successor; a reachable predecessor closes a loop."""

    def test_cycle_found_spells_out_the_closed_path(self) -> None:
        # Adding End-to-End Testing -> API Schema: API Schema -> Payments -> E2E -> API Schema.
        assert find_cycle_path(ALPHA_EDGES, 5, 2) == [2, 3, 5, 2]

    def test_direct_back_edge(self) -> None:
        assert find_cycle_path([make_edge(1, 2)], 2, 1) == [1, 2, 1]

    def test_no_cycle_returns_none(self) -> None:
        assert find_cycle_path(ALPHA_EDGES, 2, 5) is None  # a forward shortcut is fine
        assert find_cycle_path(ALPHA_EDGES, 4, 5) is None  # sibling branches
        assert find_cycle_path(ALPHA_EDGES, 6, 1) is None  # unrelated new node
        assert find_cycle_path([], 1, 2) is None

    def test_self_edge_is_a_cycle(self) -> None:
        assert find_cycle_path(ALPHA_EDGES, 3, 3) == [3, 3]
        assert find_cycle_path([], 7, 7) == [7, 7]

    def test_shortest_loop_is_reported(self) -> None:
        # 1 -> 2 -> 3 -> 4 plus a shortcut 1 -> 4: adding 4 -> 1 reports the short loop.
        edges = [make_edge(1, 2), make_edge(2, 3), make_edge(3, 4), make_edge(1, 4)]
        assert find_cycle_path(edges, 4, 1) == [1, 4, 1]

    def test_existing_cycle_does_not_loop_forever(self) -> None:
        edges = [make_edge(1, 2), make_edge(2, 1), make_edge(2, 3)]
        assert find_cycle_path(edges, 4, 1) is None
        assert find_cycle_path(edges, 3, 1) == [1, 2, 3, 1]


class TestDownstream:
    """downstream: BFS depth from a root, root excluded, depth 1 = direct successor."""

    def test_depths_from_alpha_roots(self) -> None:
        assert downstream(ALPHA_EDGES, 2) == {3: 1, 4: 1, 5: 2}
        assert downstream(ALPHA_EDGES, 1) == {2: 1, 3: 2, 4: 2, 5: 3}

    def test_diamond_reports_the_shortest_depth(self) -> None:
        edges = [make_edge(1, 2), make_edge(2, 3), make_edge(1, 3), make_edge(3, 4)]
        assert downstream(edges, 1) == {2: 1, 3: 1, 4: 2}

    def test_leaf_and_unknown_root_have_nothing_downstream(self) -> None:
        assert downstream(ALPHA_EDGES, 5) == {}
        assert downstream(ALPHA_EDGES, 999) == {}

    def test_root_is_excluded_even_inside_a_cycle(self) -> None:
        assert downstream([make_edge(1, 2), make_edge(2, 1)], 1) == {2: 1}


class TestRootCauses:
    """A root cause is not DONE and is BLOCKED or past its due date."""

    def test_overdue_boundaries(self) -> None:
        assert is_overdue(make_deliverable(1, due=-1), T)
        assert not is_overdue(make_deliverable(1, due=0), T)  # due today is not late yet
        assert not is_overdue(make_deliverable(1, status="DONE", due=-10), T)

    def test_root_cause_rules(self) -> None:
        assert is_root_cause(make_deliverable(1, status="BLOCKED", due=30), T)  # blocked, not late
        assert is_root_cause(make_deliverable(1, status="NOT_STARTED", due=-1), T)  # late, not blocked
        assert not is_root_cause(make_deliverable(1, due=0), T)
        assert not is_root_cause(make_deliverable(1, status="DONE", due=-5), T)


class TestAnalyzeDependencies:
    """Impacted = downstream of every root cause, minus DONE items and minus the roots."""

    def test_alpha_chain(self) -> None:
        deliverables = [
            make_deliverable(1, status="DONE", due=-30),
            make_deliverable(2, title="API Schema", status="BLOCKED", due=-5),
            make_deliverable(3, due=10),
            make_deliverable(4, due=14),
            make_deliverable(5, due=22),
            make_deliverable(6, due=-3),
        ]
        analysis = analyze_dependencies(deliverables, ALPHA_EDGES, T)
        assert analysis.root_cause_ids == (2, 6)
        assert list(analysis.impacted) == [3, 4, 5]
        assert analysis.impacted[5] == ImpactedItem(
            id=5, title="Deliverable 5", project_id=1, depth=2, caused_by_id=2, caused_by_title="API Schema"
        )
        assert analysis.held_up_by_root == {2: (3, 4, 5), 6: ()}

    def test_impacted_excludes_done_but_reaches_through_it(self) -> None:
        # 1 BLOCKED -> 2 DONE -> 3 open: 3 is impacted at depth 2; the DONE item is not.
        deliverables = [make_deliverable(1, status="BLOCKED"), make_deliverable(2, status="DONE"), make_deliverable(3)]
        analysis = analyze_dependencies(deliverables, [make_edge(1, 2), make_edge(2, 3)], T)
        assert list(analysis.impacted) == [3]
        assert analysis.impacted[3].depth == 2
        assert analysis.held_up_by_root[1] == (3,)

    def test_roots_are_never_impacted_and_the_nearest_root_wins(self) -> None:
        # 1 BLOCKED -> 2 overdue -> 3: 2 is a root itself, and 3 is nearer to 2 than to 1.
        deliverables = [make_deliverable(1, status="BLOCKED"), make_deliverable(2, due=-2), make_deliverable(3)]
        analysis = analyze_dependencies(deliverables, [make_edge(1, 2), make_edge(2, 3)], T)
        assert analysis.root_cause_ids == (1, 2)
        assert list(analysis.impacted) == [3]
        assert (analysis.impacted[3].caused_by_id, analysis.impacted[3].depth) == (2, 1)
        assert analysis.held_up_by_root[1] == (2, 3)  # a late item downstream is still held up

    def test_depth_tie_goes_to_the_lowest_root_id(self) -> None:
        deliverables = [
            make_deliverable(1, status="BLOCKED"),
            make_deliverable(2, status="BLOCKED"),
            make_deliverable(3),
        ]
        analysis = analyze_dependencies(deliverables, [make_edge(2, 3), make_edge(1, 3)], T)
        assert analysis.impacted[3].caused_by_id == 1

    def test_impact_crosses_projects(self) -> None:
        deliverables = [make_deliverable(1, project_id=1, status="BLOCKED"), make_deliverable(2, project_id=2)]
        analysis = analyze_dependencies(deliverables, [make_edge(1, 2)], T)
        assert analysis.impacted[2].project_id == 2

    def test_edges_to_unknown_deliverables_are_ignored(self) -> None:
        deliverables = [make_deliverable(1, status="BLOCKED"), make_deliverable(2)]
        analysis = analyze_dependencies(deliverables, [make_edge(1, 99), make_edge(99, 2)], T)
        assert analysis.impacted == {}
        assert analysis.held_up_by_root == {1: ()}

    def test_no_root_causes(self) -> None:
        analysis = analyze_dependencies([make_deliverable(1), make_deliverable(2)], [make_edge(1, 2)], T)
        assert (analysis.root_cause_ids, dict(analysis.impacted), dict(analysis.held_up_by_root)) == ((), {}, {})


class TestTopologicalLevels:
    """Kahn's algorithm; level = longest distance from a source."""

    def test_longest_distance_from_a_source(self) -> None:
        # 1 -> 2 -> 3 plus a shortcut 1 -> 3: 3 sits at level 2, not 1. 4 is isolated.
        levels = topological_levels([1, 2, 3, 4], [make_edge(1, 2), make_edge(2, 3), make_edge(1, 3)])
        assert levels == {1: 0, 2: 1, 3: 2, 4: 0}

    def test_alpha_chain_in_columns(self) -> None:
        levels = topological_levels([1, 2, 3, 4, 5, 6], ALPHA_EDGES)
        assert levels == {1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 0}
        assert levels_as_columns(levels) == [[1, 6], [2], [3, 4], [5]]

    def test_edges_outside_the_node_set_are_ignored(self) -> None:
        assert topological_levels([2, 3], [make_edge(1, 2), make_edge(2, 3), make_edge(3, 9)]) == {2: 0, 3: 1}

    def test_duplicate_edges_are_harmless(self) -> None:
        assert topological_levels([1, 2], [make_edge(1, 2), (1, 2)]) == {1: 0, 2: 1}

    def test_nodes_in_or_downstream_of_a_cycle_share_one_extra_level(self) -> None:
        # 2 <-> 3 is a cycle; 4 is only downstream of it, yet it cannot be ordered either.
        edges = [make_edge(1, 2), make_edge(2, 3), make_edge(3, 2), make_edge(3, 4)]
        assert topological_levels([1, 2, 3, 4], edges) == {1: 0, 2: 1, 3: 1, 4: 1}
        assert topological_levels([1, 2], [make_edge(1, 2), make_edge(2, 1)]) == {1: 0, 2: 0}
        assert topological_levels([5], [make_edge(5, 5)]) == {5: 0}

    def test_empty_inputs(self) -> None:
        assert topological_levels([], ALPHA_EDGES) == {}
        assert levels_as_columns({}) == []
