"""Risk engine: each factor at zero, mid and cap; level boundaries; evidence and actions (spec 9.4)."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal

import pytest
from engine_factories import T, make_allocation, make_deliverable, make_edge, make_project, make_snapshot

from app.engines.risk import RISK_FACTORS, RISK_WEIGHTS, SCORED_STATUSES, analyze_portfolio, risk_level
from app.engines.types import (
    AllocationFact,
    DeliverableFact,
    DependencyEdge,
    ImpactedItem,
    ProjectFact,
    RiskAssessment,
    RiskFactor,
)

# A person used by the resource-factor tests.
PAT = {"user_id": 7, "user_name": "Pat Lee"}


def assess(
    deliverables: Iterable[DeliverableFact] = (),
    *,
    project: ProjectFact | None = None,
    edges: Iterable[DependencyEdge] = (),
    allocations: Iterable[AllocationFact] = (),
    spend: Decimal | int = 0,
) -> RiskAssessment:
    """Score one project (by default ACTIVE, 100,000.00 planned, ending at T+90) as of T."""
    target = project or make_project(1)
    snapshot = make_snapshot([target], deliverables, edges, allocations, {target.id: spend})
    return analyze_portfolio(snapshot, T).risks[target.id]


def points(risk: RiskAssessment, key: str) -> int:
    """Return one factor's points."""
    return risk.factor(key).points


class TestConstantsAndLevels:
    """The constants block and the level boundaries."""

    def test_factor_keys_labels_and_caps(self) -> None:
        assert RISK_FACTORS == (
            ("schedule", "Schedule", 20),
            ("blocked", "Blocked deliverables", 15),
            ("blast_radius", "Dependency blast radius", 20),
            ("resource", "Resource over-allocation", 15),
            ("budget", "Budget vs progress", 20),
            ("deadline", "Deadline proximity", 10),
        )
        assert sum(maximum for *_, maximum in RISK_FACTORS) == 100
        assert (RISK_WEIGHTS.schedule_points_per_overdue, RISK_WEIGHTS.blast_points_per_impacted) == (8, 5)
        assert SCORED_STATUSES == {"PLANNED", "ACTIVE", "ON_HOLD"}

    @pytest.mark.parametrize(
        ("score", "level"),
        [
            (0, "LOW"),
            (24, "LOW"),
            (25, "MEDIUM"),
            (49, "MEDIUM"),
            (50, "HIGH"),
            (74, "HIGH"),
            (75, "CRITICAL"),
            (100, "CRITICAL"),
            (-1, "LOW"),
        ],
    )
    def test_level_boundaries(self, score: int, level: str) -> None:
        assert risk_level(score) == level


class TestScheduleFactor:
    """8 points per overdue open deliverable, capped at 20."""

    def test_zero(self) -> None:
        risk = assess([make_deliverable(1, due=0), make_deliverable(2, status="DONE", due=-9)])
        assert risk.factor("schedule") == RiskFactor("schedule", "Schedule", 0, 20, "No overdue deliverables")

    def test_one_overdue_is_8_points(self) -> None:
        risk = assess([make_deliverable(1, title="Campaign Creative", pct=60, due=-4)])
        assert risk.factor("schedule") == RiskFactor("schedule", "Schedule", 8, 20, "1 overdue deliverable")
        assert risk.evidence == ("1 deliverable is overdue: 'Campaign Creative' (due 2026-11-21, 4 days late).",)
        assert risk.recommended_actions == ("Re-plan the 1 overdue deliverable: 'Campaign Creative' (4 days late).",)

    def test_two_overdue_is_16_and_a_blocked_item_counts_too(self) -> None:
        risk = assess([make_deliverable(1, status="BLOCKED", due=-1), make_deliverable(2, due=-3)])
        assert (points(risk, "schedule"), risk.factor("schedule").detail) == (16, "2 overdue deliverables")
        assert points(risk, "blocked") == 10
        assert (
            "2 deliverables are overdue: 'Deliverable 2' (due 2026-11-22, 3 days late) "
            "and 'Deliverable 1' (due 2026-11-24, 1 day late)."
        ) in risk.evidence
        assert (
            "Re-plan the 2 overdue deliverables: 'Deliverable 2' (3 days late) and 'Deliverable 1' (1 day late)."
        ) in risk.recommended_actions

    def test_capped_at_20(self) -> None:
        risk = assess([make_deliverable(i, due=-i) for i in (1, 2, 3)])
        assert (points(risk, "schedule"), risk.factor("schedule").detail) == (20, "3 overdue deliverables")


class TestBlockedFactor:
    """10 points for the first blocked deliverable, 5 for each further one, capped at 15."""

    def test_zero(self) -> None:
        risk = assess([make_deliverable(1)])
        assert risk.factor("blocked") == RiskFactor("blocked", "Blocked deliverables", 0, 15, "No blocked deliverables")

    def test_first_blocked_is_10_points(self) -> None:
        deliverables = [
            make_deliverable(
                1,
                title="Scanner Procurement",
                status="BLOCKED",
                assignee=9,
                assignee_name="Sana Khan",
                reason="Vendor delivery delayed",
            ),
            make_deliverable(2, title="Pilot Go-Live"),
        ]
        risk = assess(deliverables, edges=[make_edge(1, 2)])
        assert (points(risk, "blocked"), risk.factor("blocked").detail) == (10, "1 blocked deliverable")
        assert "Deliverable 'Scanner Procurement' is BLOCKED and holds up 1 downstream deliverable." in risk.evidence
        assert (
            "Escalate the blocker on 'Scanner Procurement' (owner: Sana Khan); it holds up 1 downstream "
            "deliverable. Blocked reason: Vendor delivery delayed."
        ) in risk.recommended_actions

    def test_second_blocked_reaches_the_cap_of_15(self) -> None:
        risk = assess([make_deliverable(1, status="BLOCKED"), make_deliverable(2, status="BLOCKED")])
        assert (points(risk, "blocked"), risk.factor("blocked").detail) == (15, "2 blocked deliverables")

    def test_third_blocked_stays_at_15(self) -> None:
        assert points(assess([make_deliverable(i, status="BLOCKED") for i in (1, 2, 3)]), "blocked") == 15

    def test_unassigned_blocker_without_a_reason(self) -> None:
        risk = assess([make_deliverable(1, status="BLOCKED", reason="   ")])
        assert risk.evidence == ("Deliverable 'Deliverable 1' is BLOCKED and holds up no downstream deliverables.",)
        assert risk.recommended_actions == (
            "Escalate the blocker on 'Deliverable 1' (owner: unassigned); it holds up no downstream "
            "deliverables. No blocked reason is recorded.",
        )

    def test_reason_keeps_its_own_punctuation(self) -> None:
        risk = assess([make_deliverable(1, status="BLOCKED", reason="Waiting on legal!")])
        assert risk.recommended_actions[0].endswith("Blocked reason: Waiting on legal!")


class TestBlastRadiusFactor:
    """5 points per impacted deliverable of this project, capped at 20."""

    def test_zero_without_root_causes(self) -> None:
        risk = assess([make_deliverable(1), make_deliverable(2)], edges=[make_edge(1, 2)])
        assert risk.factor("blast_radius") == RiskFactor(
            "blast_radius", "Dependency blast radius", 0, 20, "No impacted deliverables"
        )
        assert risk.impacted_deliverables == ()

    def test_two_impacted_is_10_points(self) -> None:
        deliverables = [
            make_deliverable(1, title="Campaign Creative", due=-4),
            make_deliverable(2, title="Website Refresh"),
            make_deliverable(3, title="Launch Event"),
        ]
        risk = assess(deliverables, edges=[make_edge(1, 2), make_edge(1, 3)])
        assert (points(risk, "blast_radius"), risk.factor("blast_radius").detail) == (10, "2 impacted deliverables")
        assert risk.impacted_deliverables == (
            ImpactedItem(2, "Website Refresh", 1, 1, 1, "Campaign Creative"),
            ImpactedItem(3, "Launch Event", 1, 1, 1, "Campaign Creative"),
        )
        assert (
            "'Campaign Creative' (4 days overdue) puts 2 downstream deliverables in this project at risk: "
            "'Website Refresh' (depth 1) and 'Launch Event' (depth 1)."
        ) in risk.evidence
        assert "Protect downstream work: 'Website Refresh' and 'Launch Event'." in risk.recommended_actions

    def test_capped_at_20(self) -> None:
        deliverables = [make_deliverable(1, status="BLOCKED"), *(make_deliverable(i) for i in range(2, 7))]
        risk = assess(deliverables, edges=[make_edge(1, i) for i in range(2, 7)])
        assert (points(risk, "blast_radius"), len(risk.impacted_deliverables)) == (20, 5)

    def test_root_cause_in_another_project_counts_where_the_impact_lands(self) -> None:
        deliverables = [
            make_deliverable(1, project_id=2, title="Brand Guidelines", status="BLOCKED", due=-2),
            make_deliverable(2, project_id=1, title="Website Refresh"),
        ]
        snapshot = make_snapshot(
            [make_project(1), make_project(2, name="Project Beta")], deliverables, [make_edge(1, 2)]
        )
        risks = analyze_portfolio(snapshot, T).risks
        assert (points(risks[1], "blast_radius"), points(risks[2], "blast_radius")) == (5, 0)
        assert (
            "'Brand Guidelines' in Project Beta (blocked, 2 days overdue) puts 1 downstream deliverable in "
            "this project at risk: 'Website Refresh' (depth 1)."
        ) in risks[1].evidence

    def test_root_cause_outside_the_snapshot_projects_is_still_explained(self) -> None:
        deliverables = [make_deliverable(1, project_id=99, title="Orphan", status="BLOCKED"), make_deliverable(2)]
        risk = assess(deliverables, edges=[make_edge(1, 2)])
        assert (
            "'Orphan' (blocked) puts 1 downstream deliverable in this project at risk: 'Deliverable 2' (depth 1)."
        ) in risk.evidence


class TestResourceFactor:
    """8 per person in a current conflict through this project, +4 for a bottleneck here, capped at 15."""

    def test_zero_without_a_conflict(self) -> None:
        risk = assess(allocations=[make_allocation(1, **PAT, pct=80, start=-5, end=5)])
        assert risk.factor("resource") == RiskFactor(
            "resource", "Resource over-allocation", 0, 15, "No over-allocated people"
        )

    def test_past_conflict_scores_zero(self) -> None:
        allocations = [
            make_allocation(1, **PAT, pct=60, start=-9, end=-1),
            make_allocation(2, **PAT, project_id=2, pct=60, start=-9, end=-1),
        ]
        assert points(assess(allocations=allocations), "resource") == 0

    def test_conflict_that_excludes_this_projects_allocation_scores_zero(self) -> None:
        # Like Priya's Gamma allocation: later, no overlap with the conflict, so it must not be flagged.
        allocations = [
            make_allocation(1, **PAT, project_id=1, pct=50, start=40, end=70),
            make_allocation(2, **PAT, project_id=2, pct=60, start=0, end=10),
            make_allocation(3, **PAT, project_id=3, pct=60, start=0, end=10),
        ]
        assert points(assess(allocations=allocations), "resource") == 0

    def test_person_in_a_current_conflict_is_8_points(self) -> None:
        allocations = [
            make_allocation(1, **PAT, pct=60, start=-10, end=20),
            make_allocation(2, **PAT, project_id=2, pct=60, start=-2, end=12),
        ]
        risk = assess(allocations=allocations)
        assert (points(risk, "resource"), risk.factor("resource").detail) == (8, "1 over-allocated person")
        assert risk.evidence == ("Pat Lee is at 120% concurrent allocation from 2026-11-23 to 2026-12-07.",)
        assert risk.recommended_actions == (
            "Rebalance Pat Lee: remove at least 20 points between 2026-11-23 and 2026-12-07, "
            "or reassign their 60% allocation on this project.",
        )

    def test_compound_bottleneck_on_this_project_adds_4(self) -> None:
        deliverables = [make_deliverable(1, title="API Schema", status="BLOCKED", assignee=7, assignee_name="Pat Lee")]
        allocations = [
            make_allocation(1, **PAT, deliverable_id=1, pct=60, start=-10, end=20),
            make_allocation(2, **PAT, project_id=2, pct=60, start=-2, end=12),
        ]
        risk = assess(deliverables, allocations=allocations)
        assert (points(risk, "resource"), risk.factor("resource").detail) == (
            12,
            "1 over-allocated person, 1 compound bottleneck",
        )
        assert (
            "Pat Lee is a compound bottleneck on this project: over-allocated while responsible for "
            "'API Schema' (blocked)."
        ) in risk.evidence
        assert (
            "Rebalance Pat Lee: remove at least 20 points between 2026-11-23 and 2026-12-07, or reassign 'API Schema'."
        ) in risk.recommended_actions

    def test_bottleneck_through_another_project_adds_nothing_here(self) -> None:
        # Pat owns a blocked deliverable of project 2 only: project 1 scores 8, project 2 scores 12.
        deliverables = [make_deliverable(1, project_id=2, status="BLOCKED", assignee=7)]
        allocations = [
            make_allocation(1, **PAT, pct=60, start=-10, end=20),
            make_allocation(2, **PAT, project_id=2, pct=60, start=-2, end=12),
        ]
        snapshot = make_snapshot([make_project(1), make_project(2)], deliverables, [], allocations)
        risks = analyze_portfolio(snapshot, T).risks
        assert (points(risks[1], "resource"), points(risks[2], "resource")) == (8, 12)

    def test_bottleneck_through_an_impacted_deliverable(self) -> None:
        deliverables = [
            make_deliverable(1, title="API Schema", status="BLOCKED"),
            make_deliverable(2, title="Payments", assignee=7),
        ]
        allocations = [
            make_allocation(1, **PAT, pct=60, start=-2, end=12),
            make_allocation(2, **PAT, project_id=2, pct=60, start=-2, end=12),
        ]
        risk = assess(deliverables, edges=[make_edge(1, 2)], allocations=allocations)
        assert points(risk, "resource") == 12
        assert (
            "Pat Lee is a compound bottleneck on this project: over-allocated while responsible for "
            "'Payments' (downstream of 'API Schema')."
        ) in risk.evidence

    def test_two_people_are_capped_at_15(self) -> None:
        allocations = [
            make_allocation(1, **PAT, pct=60, start=-2, end=12),
            make_allocation(2, **PAT, project_id=2, pct=60, start=-2, end=12),
            make_allocation(3, user_id=8, user_name="Kim Roy", pct=70, start=0, end=5),
            make_allocation(4, user_id=8, user_name="Kim Roy", project_id=2, pct=70, start=0, end=5),
        ]
        risk = assess(allocations=allocations)
        assert (points(risk, "resource"), risk.factor("resource").detail) == (15, "2 over-allocated people")
        assert [line.split(" is at ")[0] for line in risk.evidence] == ["Kim Roy", "Pat Lee"]

    def test_one_point_over_full_load_reads_singular(self) -> None:
        # 51% + 50% peaks at 101%: the action asks for "1 point", not "1 points".
        allocations = [
            make_allocation(1, **PAT, pct=51, start=0, end=10),
            make_allocation(2, **PAT, project_id=2, pct=50, start=0, end=5),
        ]
        risk = assess(allocations=allocations)
        assert risk.evidence == ("Pat Lee is at 101% concurrent allocation from 2026-11-25 to 2026-11-30.",)
        assert risk.recommended_actions == (
            "Rebalance Pat Lee: remove at least 1 point between 2026-11-25 and 2026-11-30, "
            "or reassign their 51% allocation on this project.",
        )

    def test_back_to_back_conflicts_are_one_window(self) -> None:
        # Segments 110% (T+5..T+7) and 140% (T+8..T+10) are adjacent, so they are reported together.
        allocations = [
            make_allocation(1, **PAT, pct=60, start=0, end=20),
            make_allocation(2, **PAT, project_id=2, pct=50, start=5, end=10),
            make_allocation(3, **PAT, project_id=3, pct=30, start=8, end=15),
        ]
        risk = assess(allocations=allocations)
        assert risk.evidence == ("Pat Lee is at up to 140% concurrent allocation from 2026-11-30 to 2026-12-05.",)
        assert risk.recommended_actions == (
            "Rebalance Pat Lee: remove at least 40 points between 2026-11-30 and 2026-12-05, "
            "or reassign their 60% allocation on this project.",
        )

    def test_separate_conflict_windows_each_get_a_line(self) -> None:
        allocations = [
            make_allocation(1, **PAT, pct=60, start=0, end=30),
            make_allocation(2, **PAT, project_id=2, pct=60, start=2, end=4),
            make_allocation(3, **PAT, project_id=2, pct=60, start=10, end=12),
        ]
        risk = assess(allocations=allocations)
        assert points(risk, "resource") == 8  # one person, however many windows
        assert risk.evidence == (
            "Pat Lee is at 120% concurrent allocation from 2026-11-27 to 2026-11-29.",
            "Pat Lee is at 120% concurrent allocation from 2026-12-05 to 2026-12-07.",
        )
        assert len(risk.recommended_actions) == 2

    def test_reassign_names_open_work_of_this_project(self) -> None:
        deliverables = [
            make_deliverable(1, title="Alpha Task", assignee=7),
            make_deliverable(2, title="Finished Task", status="DONE", assignee=7),
            make_deliverable(3, title="Gamma Task"),
            make_deliverable(4, project_id=2, title="Elsewhere"),
        ]
        allocations = [
            make_allocation(1, **PAT, deliverable_id=3, pct=60, start=-2, end=12),
            make_allocation(2, **PAT, project_id=2, deliverable_id=4, pct=60, start=-2, end=12),
        ]
        risk = assess(deliverables, allocations=allocations)
        assert risk.recommended_actions == (
            "Rebalance Pat Lee: remove at least 20 points between 2026-11-23 and 2026-12-07, "
            "or reassign 'Alpha Task' or 'Gamma Task'.",
        )


class TestBudgetFactor:
    """20 points above 100% utilization, else (divergence - 10) * 0.5 rounded half up, capped at 20."""

    @staticmethod
    def _risk(spend: Decimal | int, pct: int = 40) -> RiskAssessment:
        """Project 1 plans 100,000.00 and has one deliverable at ``pct``% complete, due well ahead."""
        return assess([make_deliverable(1, pct=pct, due=60)], spend=spend)

    def test_no_planned_budget_scores_zero(self) -> None:
        risk = assess([make_deliverable(1, pct=0)], project=make_project(1, planned=0), spend=500)
        assert risk.factor("budget") == RiskFactor("budget", "Budget vs progress", 0, 20, "No planned budget")

    def test_divergence_of_10_or_less_scores_zero(self) -> None:
        factor = self._risk(50000).factor("budget")
        assert (factor.points, factor.detail) == (0, "50.0% spent at 40.0% complete")

    def test_divergence_points_round_half_up(self) -> None:
        assert points(self._risk(51000), "budget") == 1  # (11.0 - 10) * 0.5 = 0.5 -> 1
        assert points(self._risk(50100), "budget") == 0  # (10.1 - 10) * 0.5 = 0.05 -> 0

    def test_divergence_of_20_is_5_points(self) -> None:
        risk = self._risk(60000)
        assert points(risk, "budget") == 5
        assert risk.evidence == ("60.0% of the planned budget is consumed while deliverables are 40.0% complete.",)
        assert risk.recommended_actions == (
            "Freeze discretionary spend and re-baseline: 60.0% spent at 40.0% complete.",
        )

    def test_large_divergence_is_capped_at_20(self) -> None:
        risk = self._risk(100000)  # exactly 100.0% is not over budget, but it is 60 pp ahead of progress
        assert (points(risk, "budget"), risk.factor("budget").detail) == (20, "100.0% spent at 40.0% complete")

    def test_over_budget_is_20_points(self) -> None:
        risk = self._risk(Decimal("100100.00"), pct=90)
        assert (points(risk, "budget"), risk.factor("budget").detail) == (
            20,
            "100.1% spent at 90.0% complete (over budget)",
        )
        assert "Actual spend of 100,100.00 exceeds the planned budget of 100,000.00 by 100.00." in risk.evidence

    def test_overrun_hidden_by_rounding_is_still_over_budget(self) -> None:
        # 400,150.00 of 400,000.00 is 100.0375%, shown as 100.0%: the exact amounts decide, and the money explains it.
        project = make_project(1, planned="400000.00")
        risk = assess([make_deliverable(1, pct=99, due=60)], project=project, spend=Decimal("400150.00"))
        assert (points(risk, "budget"), risk.factor("budget").detail) == (
            20,
            "100.0% spent at 99.0% complete (over budget)",
        )
        assert risk.evidence == (
            "100.0% of the planned budget is consumed while deliverables are 99.0% complete.",
            "Actual spend of 400,150.00 exceeds the planned budget of 400,000.00 by 150.00.",
        )
        assert risk.recommended_actions == (
            "Freeze discretionary spend and re-baseline: 100.0% spent at 99.0% complete.",
        )

    def test_spend_equal_to_or_just_under_plan_is_not_over_budget(self) -> None:
        # Exactly 100% and 99.96% (shown as 100.0%) are not above 100%; 5 pp of divergence scores nothing.
        for spend in (Decimal("100000.00"), Decimal("99960.00")):
            factor = self._risk(spend, pct=95).factor("budget")
            assert (factor.points, factor.detail) == (0, "100.0% spent at 95.0% complete")


class TestDeadlineFactor:
    """10 if passed and incomplete; 10 within 30 days below 70%; 5 within 60 days below 50%."""

    @staticmethod
    def _risk(end: int, pct: int) -> RiskAssessment:
        """Project 1 ends ``end`` days from T; one deliverable at ``pct``% is due after that."""
        return assess([make_deliverable(1, pct=pct, due=end + 30)], project=make_project(1, end=end))

    def test_far_away_scores_zero(self) -> None:
        factor = self._risk(90, 0).factor("deadline")
        assert (factor.points, factor.detail) == (0, "90 days left at 0.0% complete")

    def test_within_60_days_below_50_percent_is_5(self) -> None:
        risk = self._risk(60, 49)
        assert (points(risk, "deadline"), risk.factor("deadline").detail) == (5, "60 days left at 49.0% complete")
        assert "The project ends on 2027-01-24, 60 days from now, with deliverables 49.0% complete." in risk.evidence
        assert "Review scope or end date: 60 days left at 49.0% complete." in risk.recommended_actions
        assert points(self._risk(61, 0), "deadline") == 0
        assert points(self._risk(60, 50), "deadline") == 0

    def test_within_30_days_below_70_percent_is_10(self) -> None:
        assert points(self._risk(30, 69), "deadline") == 10
        assert points(self._risk(30, 70), "deadline") == 0
        assert points(self._risk(31, 69), "deadline") == 0  # 31-60 days only scores below 50%
        assert self._risk(1, 0).factor("deadline").detail == "1 day left at 0.0% complete"

    def test_end_date_today(self) -> None:
        risk = self._risk(0, 10)
        assert (points(risk, "deadline"), risk.factor("deadline").detail) == (10, "Ends today at 10.0% complete")
        assert "The project ends today (2026-11-25) with deliverables 10.0% complete." in risk.evidence
        assert "Review scope or end date: 0 days left at 10.0% complete." in risk.recommended_actions

    def test_passed_and_incomplete_is_10(self) -> None:
        risk = self._risk(-1, 99)
        assert (points(risk, "deadline"), risk.factor("deadline").detail) == (10, "Ended 1 day ago at 99.0% complete")
        assert "The project end date 2026-11-24 passed 1 day ago with deliverables 99.0% complete." in risk.evidence
        assert "Review scope or end date: 1 day past the end date at 99.0% complete." in risk.recommended_actions

    def test_passed_but_complete_scores_zero(self) -> None:
        factor = self._risk(-5, 100).factor("deadline")
        assert (factor.points, factor.detail) == (0, "Ended 5 days ago at 100.0% complete")

    def test_passed_with_open_work_that_rounds_to_100_percent_is_10(self) -> None:
        # 19 DONE deliverables and one at 99%: the mean is 99.95, shown as 100.0%, but the project is incomplete.
        deliverables = [make_deliverable(i, status="DONE", due=-10) for i in range(1, 20)]
        deliverables.append(make_deliverable(20, pct=99, due=10))
        risk = assess(deliverables, project=make_project(1, end=-5))
        assert (points(risk, "deadline"), risk.factor("deadline").detail) == (
            10,
            "Ended 5 days ago at 100.0% complete (1 deliverable still below 100%)",
        )
        assert risk.evidence == (
            "The project end date 2026-11-20 passed 5 days ago with deliverables 100.0% complete "
            "(1 deliverable still below 100%).",
        )
        assert risk.recommended_actions == (
            "Review scope or end date: 5 days past the end date at 100.0% complete (1 deliverable still below 100%).",
        )

    def test_passed_without_deliverables_is_incomplete(self) -> None:
        # Completion is 0.0% when there are no deliverables (spec 9.3), so a passed end date scores 10.
        risk = assess(project=make_project(1, end=-3))
        assert (points(risk, "deadline"), risk.factor("deadline").detail) == (10, "Ended 3 days ago at 0.0% complete")


class TestAssessment:
    """Scored statuses, ordering of evidence and actions, and the portfolio result."""

    @pytest.mark.parametrize("status", ["COMPLETED", "CANCELLED"])
    def test_closed_projects_score_zero_with_one_reason(self, status: str) -> None:
        deliverables = [make_deliverable(1, status="BLOCKED", due=-5), make_deliverable(2, due=-3)]
        project = make_project(1, status=status, end=-10)
        risk = assess(deliverables, project=project, edges=[make_edge(1, 2)], spend=500000)
        assert (risk.risk_score, risk.risk_level) == (0, "LOW")
        assert all(factor.points == 0 for factor in risk.factors)
        assert {factor.detail for factor in risk.factors} == {f"Not scored: project is {status}"}
        assert risk.evidence == (f"Project is {status}, so its delivery risk is not scored.",)
        assert (risk.recommended_actions, risk.impacted_deliverables) == ((), ())

    @pytest.mark.parametrize("status", ["PLANNED", "ACTIVE", "ON_HOLD"])
    def test_open_projects_are_scored(self, status: str) -> None:
        risk = assess([make_deliverable(1, due=-1)], project=make_project(1, status=status))
        assert (risk.risk_score, risk.risk_level) == (8, "LOW")

    def test_quiet_project_says_no_rule_is_triggered(self) -> None:
        risk = assess([make_deliverable(1, pct=60)], spend=55000)
        assert (risk.risk_score, risk.risk_level, risk.recommended_actions) == (0, "LOW", ())
        assert risk.headline == "No risk rule is triggered as of 2026-11-25."

    def test_evidence_and_actions_follow_points_then_display_order(self) -> None:
        # Budget (20) leads, then blocked (10), then schedule (8); zero-point factors add no lines.
        deliverables = [make_deliverable(1, title="Late", status="BLOCKED", due=-1, pct=90)]
        risk = assess(deliverables, spend=110000)
        assert [factor.points for factor in risk.factors] == [8, 10, 0, 0, 20, 0]
        assert risk.headline.startswith("110.0% of the planned budget")
        assert [action.split(" ")[0] for action in risk.recommended_actions] == ["Freeze", "Escalate", "Re-plan"]
        assert risk.risk_score == 38
        assert risk.risk_level == "MEDIUM"

    def test_factor_lookup_and_empty_headline(self) -> None:
        with pytest.raises(KeyError):
            assess().factor("unknown")
        assert RiskAssessment(1, "P", 0, "LOW", T, (), (), (), ()).headline == ""

    def test_portfolio_result(self) -> None:
        projects = [make_project(1, name="Quiet"), make_project(2, name="Late"), make_project(3, name="also busy")]
        deliverables = [make_deliverable(1, project_id=2, due=-1), make_deliverable(2, project_id=2, due=-2)]
        allocations = [
            make_allocation(1, project_id=1, pct=60, start=-1, end=1),
            make_allocation(2, project_id=3, pct=60, start=-1, end=1),
        ]
        snapshot = make_snapshot(projects, deliverables, (), allocations, {2: 1000})
        analysis = analyze_portfolio(snapshot, T)
        assert [risk.project_name for risk in analysis.ranked_risks()] == ["Late", "also busy", "Quiet"]
        assert [risk.risk_score for risk in analysis.ranked_risks()] == [16, 8, 8]
        assert analysis.over_allocated_count == 1
        assert (analysis.as_of, analysis.snapshot) == (T, snapshot)
        assert analysis.project_budgets[2].actual_spend == Decimal("1000.00")
        assert analysis.department_budgets[1].project_count == 3
        assert analysis.budget_totals.actual_spend == Decimal("1000.00")
        assert analysis.bottlenecks == {}

    def test_empty_portfolio(self) -> None:
        analysis = analyze_portfolio(make_snapshot(), T)
        assert (dict(analysis.risks), dict(analysis.capacity), analysis.over_allocated_count) == ({}, {}, 0)
