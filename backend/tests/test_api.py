"""
Integration tests: the real Lambda handler against PostgreSQL, per role.

Seed data (see app/schema.py):
  admin / Admin123!
  mlopez, dchen (managers) / Manager123!
  apatel, jsmith (Maria's team), lnovak, sokafor (David's team) / Employee123!
  "Customer Portal Redesign" - managed by Maria; members apatel, jsmith, lnovak
  "Data Warehouse Migration" - managed by David; members lnovak, sokafor
"""

from datetime import date, timedelta

TODAY = date.today()


def _project_id(client, name):
    status, projects = client.get("/projects")
    assert status == 200
    return next(p["id"] for p in projects if p["name"] == name)


def _user_id(client, username):
    status, users = client.get("/users", query={"search": username})
    assert status == 200
    return next(u["id"] for u in users if u["username"] == username)


def _new_project(admin, manager_username="mlopez", **overrides):
    body = {
        "name": "Mobile App",
        "description": "Native app",
        "manager_id": _user_id(admin, manager_username),
        "start_date": (TODAY - timedelta(days=5)).isoformat(),
        "estimated_end_date": (TODAY + timedelta(days=40)).isoformat(),
        "budget": 50000,
        **overrides,
    }
    status, project = admin.post("/projects", body)
    assert status == 201, project
    return project


# --------------------------------------------------------------------- auth
class TestAuth:
    def test_health_is_public(self, client):
        assert client.get("/health")[0] == 200

    def test_login_success_returns_tokens_without_password(self, client):
        status, body = client.post("/auth/login", {"username": "ADMIN", "password": "Admin123!"})
        assert status == 200
        assert body["access_token"] and body["refresh_token"]
        assert "password_hash" not in body["user"]

    def test_login_by_email(self, client):
        assert client.post("/auth/login", {"username": "maria.lopez@example.com",
                                           "password": "Manager123!"})[0] == 200

    def test_login_wrong_password(self, client):
        status, body = client.post("/auth/login", {"username": "admin", "password": "nope"})
        assert status == 401 and body["error"]["code"] == "unauthorized"

    def test_login_validation(self, client):
        status, body = client.post("/auth/login", {})
        assert status == 400 and set(body["error"]["details"]) == {"username", "password"}

    def test_protected_route_requires_token(self, client):
        assert client.get("/projects")[0] == 401
        client.token = "garbage"
        assert client.get("/projects")[0] == 401

    def test_refresh_token_flow(self, client):
        _, body = client.post("/auth/login", {"username": "admin", "password": "Admin123!"})
        status, refreshed = client.post("/auth/refresh", {"refresh_token": body["refresh_token"]})
        assert status == 200 and refreshed["access_token"]
        # An access token cannot be used as a refresh token.
        assert client.post("/auth/refresh", {"refresh_token": body["access_token"]})[0] == 401

    def test_me_and_change_password(self, employee):
        assert employee.get("/auth/me")[1]["username"] == "apatel"
        status, body = employee.post("/auth/change-password",
                                     {"current_password": "wrong", "new_password": "NewPass123!"})
        assert status == 400 and "current_password" in body["error"]["details"]
        assert employee.post("/auth/change-password",
                             {"current_password": "Employee123!", "new_password": "NewPass123!"})[0] == 200
        assert employee.login("apatel", "NewPass123!").token

    def test_cloudfront_prefix_is_accepted(self, admin):
        assert admin.get("/projects", prefix="/api/tracker")[0] == 200

    def test_unknown_route_and_method(self, admin):
        assert admin.get("/nope")[0] == 404
        assert admin.request("PATCH", "/projects")[0] == 405

    def test_malformed_json_body(self, admin):
        from function import handler
        event = {"rawPath": "/projects", "requestContext": {"http": {"method": "POST"}},
                 "headers": {"authorization": f"Bearer {admin.token}"}, "body": "{bad"}
        assert handler(event)["statusCode"] == 400


# -------------------------------------------------------------------- users
class TestUsers:
    def test_admin_creates_employee_with_manager(self, admin):
        status, user = admin.post("/users", {
            "name": "New Person", "email": "new@example.com", "username": "newp",
            "job_title": "Analyst", "role": "employee", "password": "Password1!",
            "manager_id": _user_id(admin, "mlopez"),
        })
        assert status == 201
        assert user["manager_name"] == "Maria Lopez"
        assert "password_hash" not in user

    def test_duplicate_username_and_email(self, admin):
        status, body = admin.post("/users", {
            "name": "Dup", "email": "AISHA.PATEL@example.com", "username": "apatel",
            "role": "employee", "password": "Password1!",
        })
        assert status == 409 and set(body["error"]["details"]) == {"username", "email"}

    def test_manager_must_be_a_manager(self, admin):
        status, body = admin.post("/users", {
            "name": "X", "email": "x@example.com", "username": "xx", "role": "employee",
            "password": "Password1!", "manager_id": _user_id(admin, "apatel"),
        })
        assert status == 400 and "manager_id" in body["error"]["details"]

    def test_only_admin_creates_users(self, manager, employee):
        body = {"name": "X", "email": "x@example.com", "username": "xx", "role": "employee", "password": "Password1!"}
        assert manager.post("/users", body)[0] == 403
        assert employee.post("/users", body)[0] == 403

    def test_manager_edits_name_and_email_of_own_team_only(self, manager):
        own = _user_id(manager, "apatel")
        other = _user_id(manager, "sokafor")
        status, user = manager.put(f"/users/{own}", {"name": "Aisha P.", "email": "aisha@example.com"})
        assert status == 200 and user["name"] == "Aisha P."
        assert manager.put(f"/users/{own}", {"job_title": "Lead"})[0] == 403
        assert manager.put(f"/users/{own}", {"manager_id": None})[0] == 403
        assert manager.put(f"/users/{other}", {"name": "Nope"})[0] == 403

    def test_only_admin_moves_employee_between_teams(self, admin):
        emp = _user_id(admin, "apatel")
        status, user = admin.put(f"/users/{emp}", {"manager_id": _user_id(admin, "dchen")})
        assert status == 200 and user["manager_name"] == "David Chen"

    def test_employee_sees_only_self_and_manager(self, employee):
        status, users = employee.get("/users")
        assert status == 200
        assert {u["username"] for u in users} == {"apatel", "mlopez"}
        assert employee.put(f"/users/{employee.user['id']}", {"name": "Me"})[0] == 403

    def test_user_detail_includes_projects_and_hours(self, admin):
        status, user = admin.get(f"/users/{_user_id(admin, 'apatel')}")
        assert status == 200
        assert user["projects"][0]["name"] == "Customer Portal Redesign"
        assert float(user["total_hours"]) > 0

    def test_archive_user_and_restore(self, admin, client):
        emp = _user_id(admin, "jsmith")
        assert admin.delete(f"/users/{emp}")[0] == 204
        assert all(u["id"] != emp for u in admin.get("/users")[1])
        assert client.post("/auth/login", {"username": "jsmith", "password": "Employee123!"})[0] == 401
        archive = admin.get("/archive")[1]
        assert any(u["id"] == emp for u in archive["users"])
        assert admin.post(f"/archive/users/{emp}/restore")[0] == 200
        assert client.post("/auth/login", {"username": "jsmith", "password": "Employee123!"})[0] == 200

    def test_cannot_archive_manager_with_projects_or_self(self, admin):
        assert admin.delete(f"/users/{_user_id(admin, 'mlopez')}")[0] == 409
        assert admin.delete(f"/users/{admin.user['id']}")[0] == 409

    def test_role_change_guards(self, admin):
        status, body = admin.put(f"/users/{_user_id(admin, 'apatel')}", {"role": "manager"})
        assert status == 409 and "project" in body["error"]["message"]
        assert admin.put(f"/users/{admin.user['id']}", {"role": "employee"})[0] == 409


# ----------------------------------------------------------------- projects
class TestProjects:
    def test_admin_creates_project(self, admin):
        project = _new_project(admin)
        assert project["manager_name"] == "Maria Lopez"
        assert project["status"] == "planned"
        assert project["planned_hours"] == 0  # no members yet

    def test_project_validation(self, admin):
        status, body = admin.post("/projects", {
            "name": "", "manager_id": _user_id(admin, "apatel"),
            "start_date": "2026-05-01", "estimated_end_date": "2026-04-01", "budget": -5,
        })
        assert status == 400
        assert {"name", "manager_id", "estimated_end_date", "budget"} <= set(body["error"]["details"])

    def test_managers_and_employees_cannot_create_projects(self, manager, employee):
        body = {"name": "X", "manager_id": 2, "start_date": "2026-01-01", "estimated_end_date": "2026-02-01"}
        assert manager.post("/projects", body)[0] == 403
        assert employee.post("/projects", body)[0] == 403

    def test_visibility_by_role(self, admin, manager, manager2, employee):
        assert len(admin.get("/projects")[1]) == 2
        assert [p["name"] for p in manager.get("/projects")[1]] == ["Customer Portal Redesign"]
        assert [p["name"] for p in manager2.get("/projects")[1]] == ["Data Warehouse Migration"]
        assert [p["name"] for p in employee.get("/projects")[1]] == ["Customer Portal Redesign"]
        other = _project_id(admin, "Data Warehouse Migration")
        assert manager.get(f"/projects/{other}")[0] == 404
        assert employee.get(f"/projects/{other}")[0] == 404

    def test_search_and_status_filter(self, admin):
        assert len(admin.get("/projects", query={"search": "warehouse"})[1]) == 1
        assert admin.get("/projects", query={"status": "completed"})[1] == []

    def test_project_detail_totals(self, manager):
        pid = _project_id(manager, "Customer Portal Redesign")
        status, project = manager.get(f"/projects/{pid}")
        assert status == 200
        assert project["member_count"] == 3
        assert project["planned_hours"] == project["working_days"] * 8 * 3
        assert float(project["total_hours"]) == sum(float(m["hours"]) for m in project["members"])
        assert len(project["milestones"]) == 2
        assert project["can_manage"] and not project["can_archive"]

    def test_manager_edits_own_project_and_budget(self, manager):
        pid = _project_id(manager, "Customer Portal Redesign")
        status, project = manager.put(f"/projects/{pid}", {"budget": 150000, "description": "Updated"})
        assert status == 200 and project["budget"] == 150000

    def test_budget_cannot_drop_below_milestone_allocation(self, manager):
        pid = _project_id(manager, "Customer Portal Redesign")
        status, body = manager.put(f"/projects/{pid}", {"budget": 1000})
        assert status == 400 and "budget" in body["error"]["details"]

    def test_manager_cannot_reassign_manager_or_touch_others(self, manager, admin):
        pid = _project_id(manager, "Customer Portal Redesign")
        assert manager.put(f"/projects/{pid}", {"manager_id": _user_id(admin, "dchen")})[0] == 403
        other = _project_id(admin, "Data Warehouse Migration")
        assert manager.put(f"/projects/{other}", {"name": "Mine"})[0] == 404

    def test_employee_cannot_edit_project(self, employee):
        pid = _project_id(employee, "Customer Portal Redesign")
        assert employee.put(f"/projects/{pid}", {"name": "x"})[0] == 403

    def test_completion_requires_milestones_done_and_archive_requires_completion(self, admin, manager):
        pid = _project_id(manager, "Customer Portal Redesign")
        status, body = manager.put(f"/projects/{pid}", {"status": "completed"})
        assert status == 400 and "status" in body["error"]["details"]

        assert admin.delete(f"/projects/{pid}")[0] == 409  # not completed yet
        for ms in manager.get(f"/projects/{pid}/milestones")[1]:
            assert manager.put(f"/milestones/{ms['id']}", {"status": "completed"})[0] == 200
        status, project = manager.put(f"/projects/{pid}", {"status": "completed"})
        assert status == 200 and project["completed_at"]

        assert manager.delete(f"/projects/{pid}")[0] == 403  # managers cannot archive
        assert admin.delete(f"/projects/{pid}")[0] == 204
        assert manager.get(f"/projects/{pid}")[0] == 404  # archived = admin-only
        assert admin.get(f"/projects/{pid}")[0] == 200
        assert any(p["id"] == pid for p in admin.get("/archive")[1]["projects"])
        assert admin.post(f"/archive/projects/{pid}/restore")[0] == 200
        assert manager.get(f"/projects/{pid}")[0] == 200

    def test_assign_members_including_other_team(self, admin, manager):
        project = _new_project(admin)
        pid = project["id"]
        own = [_user_id(manager, "apatel"), _user_id(manager, "jsmith")]
        other_team = _user_id(manager, "sokafor")  # stretch goal: onboard from another team
        status, members = manager.post(f"/projects/{pid}/members", {"user_ids": [*own, other_team]})
        assert status == 201 and len(members) == 3
        flags = {m["username"]: m["on_manager_team"] for m in members}
        assert flags == {"apatel": True, "jsmith": True, "sokafor": False}
        # Employee keeps their original manager (only admin can move teams).
        assert admin.get(f"/users/{other_team}")[1]["manager_name"] == "David Chen"
        # One employee, many projects.
        assert admin.get(f"/users/{own[0]}")[1]["project_count"] == 2

    def test_assign_rejects_non_employees_and_unassign_keeps_time(self, admin, manager):
        pid = _project_id(manager, "Customer Portal Redesign")
        assert manager.post(f"/projects/{pid}/members", {"user_ids": [_user_id(admin, "dchen")]})[0] == 400
        uid = _user_id(manager, "apatel")
        before = manager.get(f"/projects/{pid}")[1]["total_hours"]
        assert manager.delete(f"/projects/{pid}/members/{uid}")[0] == 204
        project = manager.get(f"/projects/{pid}")[1]
        assert project["member_count"] == 2 and project["total_hours"] == before
        assert manager.delete(f"/projects/{pid}/members/{uid}")[0] == 404

    def test_employee_cannot_assign(self, employee):
        pid = _project_id(employee, "Customer Portal Redesign")
        assert employee.post(f"/projects/{pid}/members", {"user_ids": [employee.user["id"]]})[0] == 403


# --------------------------------------------------------------- milestones
class TestMilestones:
    def _body(self, **kw):
        return {"name": "Launch", "start_date": TODAY.isoformat(),
                "end_date": (TODAY + timedelta(days=10)).isoformat(), "budget": 10000, **kw}

    def test_manager_creates_milestone_with_members(self, manager):
        pid = _project_id(manager, "Customer Portal Redesign")
        members = [m["id"] for m in manager.get(f"/projects/{pid}/members")[1]][:2]
        status, ms = manager.post(f"/projects/{pid}/milestones", self._body(user_ids=members))
        assert status == 201 and len(ms["members"]) == 2 and ms["status"] == "not_started"

    def test_milestone_budget_cannot_exceed_project(self, manager):
        pid = _project_id(manager, "Customer Portal Redesign")  # 120k budget, 90k allocated
        status, body = manager.post(f"/projects/{pid}/milestones", self._body(budget=40000))
        assert status == 400 and "budget" in body["error"]["details"]

    def test_milestone_dates_and_members_validated(self, manager, admin):
        pid = _project_id(manager, "Customer Portal Redesign")
        status, body = manager.post(f"/projects/{pid}/milestones", self._body(
            start_date="2000-01-01", end_date="1999-01-01", user_ids=[_user_id(admin, "sokafor")]))
        assert status == 400
        assert {"start_date", "end_date", "user_ids"} <= set(body["error"]["details"])

    def test_only_project_manager_or_admin_manage_milestones(self, manager2, employee, admin):
        pid = _project_id(admin, "Customer Portal Redesign")
        assert manager2.post(f"/projects/{pid}/milestones", self._body())[0] == 404
        assert employee.post(f"/projects/{pid}/milestones", self._body())[0] == 403
        assert admin.post(f"/projects/{pid}/milestones", self._body(budget=0))[0] == 201

    def test_complete_and_archive_milestone(self, manager, admin):
        pid = _project_id(manager, "Customer Portal Redesign")
        ms = manager.get(f"/projects/{pid}/milestones")[1][1]
        status, updated = manager.put(f"/milestones/{ms['id']}", {"status": "completed"})
        assert status == 200 and updated["completed_at"]
        assert manager.delete(f"/milestones/{ms['id']}")[0] == 204
        assert manager.get(f"/milestones/{ms['id']}")[0] == 404
        assert any(m["id"] == ms["id"] for m in admin.get("/archive")[1]["milestones"])

    def test_employee_can_view_milestones_of_own_project(self, employee):
        pid = _project_id(employee, "Customer Portal Redesign")
        assert len(employee.get(f"/projects/{pid}/milestones")[1]) == 2


# ------------------------------------------------------------- time entries
class TestTimeEntries:
    def test_employee_logs_own_time_and_totals_update(self, employee):
        pid = _project_id(employee, "Customer Portal Redesign")
        before = float(employee.get(f"/projects/{pid}")[1]["total_hours"])
        status, entry = employee.post("/time-entries", {"project_id": pid, "work_date": TODAY.isoformat(),
                                                        "hours": 8, "note": "Feature work"})
        assert status == 201 and entry["user_name"] == "Aisha Patel"
        after = employee.get(f"/projects/{pid}")[1]
        assert float(after["total_hours"]) == before + 8

    def test_time_summary_by_user_and_project(self, manager):
        status, data = manager.get("/time-entries")
        assert status == 200
        summary = data["summary"]
        assert float(summary["total_hours"]) == sum(float(r["hours"]) for r in summary["by_user"])
        assert summary["total_days"] == round(float(summary["total_hours"]) / 8, 1)
        assert {r["project_name"] for r in summary["by_project"]} == {"Customer Portal Redesign"}

    def test_employee_sees_only_own_entries(self, employee):
        entries = employee.get("/time-entries")[1]["entries"]
        assert entries and all(e["user_id"] == employee.user["id"] for e in entries)

    def test_time_validation(self, employee):
        pid = _project_id(employee, "Customer Portal Redesign")
        status, body = employee.post("/time-entries", {
            "project_id": pid, "work_date": (TODAY + timedelta(days=2)).isoformat(), "hours": 0})
        assert status == 400 and {"work_date", "hours"} <= set(body["error"]["details"])

    def test_daily_limit_of_24_hours(self, employee):
        pid = _project_id(employee, "Customer Portal Redesign")
        assert employee.post("/time-entries", {"project_id": pid, "work_date": TODAY.isoformat(), "hours": 20})[0] == 201
        assert employee.post("/time-entries", {"project_id": pid, "work_date": TODAY.isoformat(), "hours": 5})[0] == 409

    def test_employee_cannot_log_for_others_or_unassigned_projects(self, employee, admin):
        pid = _project_id(employee, "Customer Portal Redesign")
        other_user = _user_id(admin, "jsmith")
        assert employee.post("/time-entries", {"project_id": pid, "user_id": other_user,
                                               "work_date": TODAY.isoformat(), "hours": 1})[0] == 403
        other_project = _project_id(admin, "Data Warehouse Migration")
        assert employee.post("/time-entries", {"project_id": other_project,
                                               "work_date": TODAY.isoformat(), "hours": 1})[0] == 404

    def test_manager_logs_time_for_member(self, manager):
        pid = _project_id(manager, "Customer Portal Redesign")
        uid = _user_id(manager, "jsmith")
        status, entry = manager.post("/time-entries", {"project_id": pid, "user_id": uid,
                                                       "work_date": TODAY.isoformat(), "hours": 4})
        assert status == 201 and entry["user_id"] == uid
        status, body = manager.post("/time-entries", {"project_id": pid, "user_id": _user_id(manager, "sokafor"),
                                                      "work_date": TODAY.isoformat(), "hours": 4})
        assert status == 400 and "user_id" in body["error"]["details"]

    def test_edit_and_archive_entry(self, employee, admin):
        pid = _project_id(employee, "Customer Portal Redesign")
        _, entry = employee.post("/time-entries", {"project_id": pid, "work_date": TODAY.isoformat(), "hours": 2})
        status, updated = employee.put(f"/time-entries/{entry['id']}", {"hours": 3.5, "note": "fixed"})
        assert status == 200 and updated["hours"] == 3.5
        assert employee.delete(f"/time-entries/{entry['id']}")[0] == 204
        assert any(t["id"] == entry["id"] for t in admin.get("/archive")[1]["time_entries"])
        assert admin.post(f"/archive/time-entries/{entry['id']}/restore")[0] == 200

    def test_milestone_must_belong_to_project(self, employee, admin):
        pid = _project_id(employee, "Customer Portal Redesign")
        other = _project_id(admin, "Data Warehouse Migration")
        foreign_ms = admin.get(f"/projects/{other}/milestones")[1][0]["id"]
        status, body = employee.post("/time-entries", {"project_id": pid, "milestone_id": foreign_ms,
                                                       "work_date": TODAY.isoformat(), "hours": 1})
        assert status == 400 and "milestone_id" in body["error"]["details"]


# ---------------------------------------------------------- archive & misc
class TestArchiveAndDashboard:
    def test_archive_is_admin_only(self, manager, employee):
        assert manager.get("/archive")[0] == 403
        assert employee.get("/archive")[0] == 403

    def test_restore_validation(self, admin):
        assert admin.post("/archive/widgets/1/restore")[0] == 400
        assert admin.post("/archive/users/9999/restore")[0] == 404
        assert admin.post(f"/archive/users/{admin.user['id']}/restore")[0] == 409

    def test_dashboard_per_role(self, admin, manager, employee):
        a = admin.get("/dashboard")[1]["stats"]
        assert a["projects_total"] == 2 and a["employees"] == 4 and a["managers"] == 2
        m = manager.get("/dashboard")[1]["stats"]
        assert m["projects_total"] == 1 and m["team_size"] == 2
        e = employee.get("/dashboard")
        assert e[0] == 200 and e[1]["stats"]["projects_total"] == 1
