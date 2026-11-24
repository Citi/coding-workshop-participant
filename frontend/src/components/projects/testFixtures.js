/**
 * Fixture data for the project page tests: real responses of the local API for the spec
 * section 10 seed (as of 2026-11-24), captured once and frozen. Used only by tests.
 */

export const DEPARTMENTS = Object.freeze([
  {
    "id": 1,
    "name": "Engineering",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 2,
    "name": "Marketing",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 3,
    "name": "Finance",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 4,
    "name": "Operations",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 5,
    "name": "Human Resources",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  }
]);

export const USERS = Object.freeze([
  {
    "id": 1,
    "name": "Asha Rao",
    "email": "admin@acme.example",
    "role": "ADMIN",
    "department_id": 1,
    "department_name": "Engineering",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 2,
    "name": "Vikram Shah",
    "email": "pm@acme.example",
    "role": "PM",
    "department_id": 1,
    "department_name": "Engineering",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 3,
    "name": "Rohan Das",
    "email": "lead@acme.example",
    "role": "LEAD",
    "department_id": 1,
    "department_name": "Engineering",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 4,
    "name": "Neha Kapoor",
    "email": "viewer@acme.example",
    "role": "VIEWER",
    "department_id": 3,
    "department_name": "Finance",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 5,
    "name": "Priya Nair",
    "email": "priya.nair@acme.example",
    "role": "LEAD",
    "department_id": 1,
    "department_name": "Engineering",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 6,
    "name": "Arjun Mehta",
    "email": "arjun.mehta@acme.example",
    "role": "LEAD",
    "department_id": 1,
    "department_name": "Engineering",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 7,
    "name": "Meera Iyer",
    "email": "meera.iyer@acme.example",
    "role": "PM",
    "department_id": 2,
    "department_name": "Marketing",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 8,
    "name": "Kabir Sethi",
    "email": "kabir.sethi@acme.example",
    "role": "PM",
    "department_id": 3,
    "department_name": "Finance",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 9,
    "name": "Sana Khan",
    "email": "sana.khan@acme.example",
    "role": "PM",
    "department_id": 4,
    "department_name": "Operations",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 10,
    "name": "Divya Menon",
    "email": "divya.menon@acme.example",
    "role": "PM",
    "department_id": 5,
    "department_name": "Human Resources",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  }
]);

export const PROJECTS = Object.freeze([
  {
    "id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "description": "Replace the legacy card-payment stack with one payments platform for web and mobile checkout.",
    "department_id": 1,
    "department_name": "Engineering",
    "project_manager_id": 2,
    "project_manager_name": "Vikram Shah",
    "start_date": "2026-09-25",
    "end_date": "2026-12-19",
    "planned_budget": "400000.00",
    "status": "ACTIVE",
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30",
    "completion_pct": 35.0,
    "actual_spend": "300000.00",
    "remaining_budget": "100000.00",
    "utilization_pct": 75.0,
    "risk_score": 78,
    "risk_level": "CRITICAL"
  },
  {
    "id": 2,
    "project_name": "Project Beta: Brand Relaunch Campaign",
    "description": "Relaunch the ACME brand with new creative, a refreshed website and a launch event.",
    "department_id": 2,
    "department_name": "Marketing",
    "project_manager_id": 7,
    "project_manager_name": "Meera Iyer",
    "start_date": "2026-10-10",
    "end_date": "2027-01-13",
    "planned_budget": "150000.00",
    "status": "ACTIVE",
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30",
    "completion_pct": 50.0,
    "actual_spend": "105000.00",
    "remaining_budget": "45000.00",
    "utilization_pct": 70.0,
    "risk_score": 31,
    "risk_level": "MEDIUM"
  },
  {
    "id": 3,
    "project_name": "Project Gamma: Ledger Automation",
    "description": "Automate bank reconciliation and the month-end close in the general ledger.",
    "department_id": 3,
    "department_name": "Finance",
    "project_manager_id": 8,
    "project_manager_name": "Kabir Sethi",
    "start_date": "2026-10-15",
    "end_date": "2027-02-22",
    "planned_budget": "250000.00",
    "status": "ACTIVE",
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30",
    "completion_pct": 60.0,
    "actual_spend": "137500.00",
    "remaining_budget": "112500.00",
    "utilization_pct": 55.0,
    "risk_score": 0,
    "risk_level": "LOW"
  },
  {
    "id": 4,
    "project_name": "Project Delta: Warehouse Tracking Rollout",
    "description": "Roll out barcode scanning and live stock tracking across the main warehouse.",
    "department_id": 4,
    "department_name": "Operations",
    "project_manager_id": 9,
    "project_manager_name": "Sana Khan",
    "start_date": "2026-09-15",
    "end_date": "2026-12-14",
    "planned_budget": "200000.00",
    "status": "ACTIVE",
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30",
    "completion_pct": 55.0,
    "actual_spend": "210000.00",
    "remaining_budget": "-10000.00",
    "utilization_pct": 105.0,
    "risk_score": 61,
    "risk_level": "HIGH"
  },
  {
    "id": 5,
    "project_name": "Project Epsilon: Onboarding Portal",
    "description": "Self-service onboarding portal for new joiners; delivered and live.",
    "department_id": 5,
    "department_name": "Human Resources",
    "project_manager_id": 10,
    "project_manager_name": "Divya Menon",
    "start_date": "2026-07-27",
    "end_date": "2026-11-14",
    "planned_budget": "80000.00",
    "status": "COMPLETED",
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30",
    "completion_pct": 100.0,
    "actual_spend": "76000.00",
    "remaining_budget": "4000.00",
    "utilization_pct": 95.0,
    "risk_score": 0,
    "risk_level": "LOW"
  }
]);

export const ALPHA_RISK = Object.freeze({
  "project_id": 1,
  "project_name": "Project Alpha: Customer Payments Platform",
  "risk_score": 78,
  "risk_level": "CRITICAL",
  "as_of": "2026-11-24",
  "factors": [
    {
      "key": "schedule",
      "label": "Schedule",
      "points": 16,
      "max_points": 20,
      "detail": "2 overdue deliverables"
    },
    {
      "key": "blocked",
      "label": "Blocked deliverables",
      "points": 10,
      "max_points": 15,
      "detail": "1 blocked deliverable"
    },
    {
      "key": "blast_radius",
      "label": "Dependency blast radius",
      "points": 15,
      "max_points": 20,
      "detail": "3 impacted deliverables"
    },
    {
      "key": "resource",
      "label": "Resource over-allocation",
      "points": 12,
      "max_points": 15,
      "detail": "1 over-allocated person, 1 compound bottleneck"
    },
    {
      "key": "budget",
      "label": "Budget vs progress",
      "points": 15,
      "max_points": 20,
      "detail": "75.0% spent at 35.0% complete"
    },
    {
      "key": "deadline",
      "label": "Deadline proximity",
      "points": 10,
      "max_points": 10,
      "detail": "25 days left at 35.0% complete"
    }
  ],
  "evidence": [
    "2 deliverables are overdue: 'API Schema' (due 2026-11-19, 5 days late) and 'Data Migration Plan' (due 2026-11-21, 3 days late).",
    "'API Schema' (blocked, 5 days overdue) puts 3 downstream deliverables in this project at risk: 'Payments Service Integration' (depth 1), 'Mobile Client Integration' (depth 1) and 'End-to-End Testing' (depth 2).",
    "75.0% of the planned budget is consumed while deliverables are 35.0% complete.",
    "Priya Nair is at 120% concurrent allocation from 2026-11-22 to 2026-12-06.",
    "Priya Nair is a compound bottleneck on this project: over-allocated while responsible for 'API Schema' (blocked, 5 days overdue).",
    "Deliverable 'API Schema' is BLOCKED and holds up 3 downstream deliverables.",
    "The project ends on 2026-12-19, 25 days from now, with deliverables 35.0% complete."
  ],
  "impacted_deliverables": [
    {
      "id": 3,
      "title": "Payments Service Integration",
      "depth": 1,
      "caused_by": "API Schema"
    },
    {
      "id": 4,
      "title": "Mobile Client Integration",
      "depth": 1,
      "caused_by": "API Schema"
    },
    {
      "id": 5,
      "title": "End-to-End Testing",
      "depth": 2,
      "caused_by": "API Schema"
    }
  ],
  "recommended_actions": [
    "Re-plan the 2 overdue deliverables: 'API Schema' (5 days late) and 'Data Migration Plan' (3 days late).",
    "Protect downstream work: 'Payments Service Integration', 'Mobile Client Integration' and 'End-to-End Testing'.",
    "Freeze discretionary spend and re-baseline: 75.0% spent at 35.0% complete.",
    "Rebalance Priya Nair: remove at least 20 points between 2026-11-22 and 2026-12-06, or reassign 'API Schema'.",
    "Escalate the blocker on 'API Schema' (owner: Priya Nair); it holds up 3 downstream deliverables. Blocked reason: Awaiting security approval of the partner data contract.",
    "Review scope or end date: 25 days left at 35.0% complete."
  ]
});

export const EPSILON_RISK = Object.freeze({
  "project_id": 5,
  "project_name": "Project Epsilon: Onboarding Portal",
  "risk_score": 0,
  "risk_level": "LOW",
  "as_of": "2026-11-24",
  "factors": [
    {
      "key": "schedule",
      "label": "Schedule",
      "points": 0,
      "max_points": 20,
      "detail": "Not scored: project is COMPLETED"
    },
    {
      "key": "blocked",
      "label": "Blocked deliverables",
      "points": 0,
      "max_points": 15,
      "detail": "Not scored: project is COMPLETED"
    },
    {
      "key": "blast_radius",
      "label": "Dependency blast radius",
      "points": 0,
      "max_points": 20,
      "detail": "Not scored: project is COMPLETED"
    },
    {
      "key": "resource",
      "label": "Resource over-allocation",
      "points": 0,
      "max_points": 15,
      "detail": "Not scored: project is COMPLETED"
    },
    {
      "key": "budget",
      "label": "Budget vs progress",
      "points": 0,
      "max_points": 20,
      "detail": "Not scored: project is COMPLETED"
    },
    {
      "key": "deadline",
      "label": "Deadline proximity",
      "points": 0,
      "max_points": 10,
      "detail": "Not scored: project is COMPLETED"
    }
  ],
  "evidence": [
    "Project is COMPLETED, so its delivery risk is not scored."
  ],
  "impacted_deliverables": [],
  "recommended_actions": []
});

export const ALPHA_GRAPH = Object.freeze({
  "project_id": 1,
  "as_of": "2026-11-24",
  "nodes": [
    {
      "id": 1,
      "title": "Requirements Sign-off",
      "project_id": 1,
      "status": "DONE",
      "completion_percentage": 100,
      "due_date": "2026-10-25",
      "assigned_user_name": "Vikram Shah",
      "level": 0,
      "is_root_cause": false,
      "is_impacted": false,
      "is_external": false,
      "predecessor_ids": []
    },
    {
      "id": 6,
      "title": "Data Migration Plan",
      "project_id": 1,
      "status": "IN_PROGRESS",
      "completion_percentage": 50,
      "due_date": "2026-11-21",
      "assigned_user_name": "Rohan Das",
      "level": 0,
      "is_root_cause": true,
      "is_impacted": false,
      "is_external": false,
      "predecessor_ids": []
    },
    {
      "id": 2,
      "title": "API Schema",
      "project_id": 1,
      "status": "BLOCKED",
      "completion_percentage": 40,
      "due_date": "2026-11-19",
      "assigned_user_name": "Priya Nair",
      "level": 1,
      "is_root_cause": true,
      "is_impacted": false,
      "is_external": false,
      "predecessor_ids": [
        1
      ]
    },
    {
      "id": 3,
      "title": "Payments Service Integration",
      "project_id": 1,
      "status": "IN_PROGRESS",
      "completion_percentage": 20,
      "due_date": "2026-12-04",
      "assigned_user_name": "Arjun Mehta",
      "level": 2,
      "is_root_cause": false,
      "is_impacted": true,
      "is_external": false,
      "predecessor_ids": [
        2
      ]
    },
    {
      "id": 4,
      "title": "Mobile Client Integration",
      "project_id": 1,
      "status": "NOT_STARTED",
      "completion_percentage": 0,
      "due_date": "2026-12-08",
      "assigned_user_name": "Rohan Das",
      "level": 2,
      "is_root_cause": false,
      "is_impacted": true,
      "is_external": false,
      "predecessor_ids": [
        2
      ]
    },
    {
      "id": 5,
      "title": "End-to-End Testing",
      "project_id": 1,
      "status": "NOT_STARTED",
      "completion_percentage": 0,
      "due_date": "2026-12-16",
      "assigned_user_name": "Rohan Das",
      "level": 3,
      "is_root_cause": false,
      "is_impacted": true,
      "is_external": false,
      "predecessor_ids": [
        3
      ]
    }
  ],
  "edges": [
    {
      "id": 1,
      "predecessor_deliverable_id": 1,
      "successor_deliverable_id": 2
    },
    {
      "id": 2,
      "predecessor_deliverable_id": 2,
      "successor_deliverable_id": 3
    },
    {
      "id": 3,
      "predecessor_deliverable_id": 2,
      "successor_deliverable_id": 4
    },
    {
      "id": 4,
      "predecessor_deliverable_id": 3,
      "successor_deliverable_id": 5
    }
  ],
  "levels": [
    [
      1,
      6
    ],
    [
      2
    ],
    [
      3,
      4
    ],
    [
      5
    ]
  ],
  "roots": [
    2,
    6
  ],
  "impacted": [
    {
      "id": 3,
      "title": "Payments Service Integration",
      "depth": 1,
      "caused_by": "API Schema"
    },
    {
      "id": 4,
      "title": "Mobile Client Integration",
      "depth": 1,
      "caused_by": "API Schema"
    },
    {
      "id": 5,
      "title": "End-to-End Testing",
      "depth": 2,
      "caused_by": "API Schema"
    }
  ]
});

export const ALPHA_LINKS = Object.freeze([
  {
    "id": 1,
    "predecessor_deliverable_id": 1,
    "predecessor_title": "Requirements Sign-off",
    "predecessor_project_id": 1,
    "successor_deliverable_id": 2,
    "successor_title": "API Schema",
    "successor_project_id": 1,
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 2,
    "predecessor_deliverable_id": 2,
    "predecessor_title": "API Schema",
    "predecessor_project_id": 1,
    "successor_deliverable_id": 3,
    "successor_title": "Payments Service Integration",
    "successor_project_id": 1,
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 3,
    "predecessor_deliverable_id": 2,
    "predecessor_title": "API Schema",
    "predecessor_project_id": 1,
    "successor_deliverable_id": 4,
    "successor_title": "Mobile Client Integration",
    "successor_project_id": 1,
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 4,
    "predecessor_deliverable_id": 3,
    "predecessor_title": "Payments Service Integration",
    "predecessor_project_id": 1,
    "successor_deliverable_id": 5,
    "successor_title": "End-to-End Testing",
    "successor_project_id": 1,
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  }
]);

export const ALPHA_DELIVERABLES = Object.freeze([
  {
    "id": 1,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "title": "Requirements Sign-off",
    "description": null,
    "assigned_user_id": 2,
    "assigned_user_name": "Vikram Shah",
    "start_date": null,
    "due_date": "2026-10-25",
    "completion_percentage": 100,
    "status": "DONE",
    "blocked_reason": null,
    "is_overdue": false,
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 2,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "title": "API Schema",
    "description": null,
    "assigned_user_id": 5,
    "assigned_user_name": "Priya Nair",
    "start_date": null,
    "due_date": "2026-11-19",
    "completion_percentage": 40,
    "status": "BLOCKED",
    "blocked_reason": "Awaiting security approval of the partner data contract",
    "is_overdue": true,
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 3,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "title": "Payments Service Integration",
    "description": null,
    "assigned_user_id": 6,
    "assigned_user_name": "Arjun Mehta",
    "start_date": null,
    "due_date": "2026-12-04",
    "completion_percentage": 20,
    "status": "IN_PROGRESS",
    "blocked_reason": null,
    "is_overdue": false,
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 4,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "title": "Mobile Client Integration",
    "description": null,
    "assigned_user_id": 3,
    "assigned_user_name": "Rohan Das",
    "start_date": null,
    "due_date": "2026-12-08",
    "completion_percentage": 0,
    "status": "NOT_STARTED",
    "blocked_reason": null,
    "is_overdue": false,
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 5,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "title": "End-to-End Testing",
    "description": null,
    "assigned_user_id": 3,
    "assigned_user_name": "Rohan Das",
    "start_date": null,
    "due_date": "2026-12-16",
    "completion_percentage": 0,
    "status": "NOT_STARTED",
    "blocked_reason": null,
    "is_overdue": false,
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 6,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "title": "Data Migration Plan",
    "description": null,
    "assigned_user_id": 3,
    "assigned_user_name": "Rohan Das",
    "start_date": null,
    "due_date": "2026-11-21",
    "completion_percentage": 50,
    "status": "IN_PROGRESS",
    "blocked_reason": null,
    "is_overdue": true,
    "created_at": "2026-11-24T22:56:22.030041+05:30",
    "updated_at": "2026-11-24T22:56:22.030041+05:30"
  }
]);

export const ALPHA_BUDGET_ENTRIES = Object.freeze([
  {
    "id": 1,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "category": "LABOR",
    "description": "Engineering contractors",
    "amount": "180000.00",
    "entry_date": "2026-11-04",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 2,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "category": "VENDOR",
    "description": "Payment gateway integration partner",
    "amount": "60000.00",
    "entry_date": "2026-10-13",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 3,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "category": "SOFTWARE",
    "description": "API gateway and monitoring licences",
    "amount": "35000.00",
    "entry_date": "2026-10-07",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 4,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "category": "HARDWARE",
    "description": "Hardware security modules",
    "amount": "20000.00",
    "entry_date": "2026-10-25",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  },
  {
    "id": 5,
    "project_id": 1,
    "project_name": "Project Alpha: Customer Payments Platform",
    "category": "TRAVEL",
    "description": "Partner workshop travel",
    "amount": "5000.00",
    "entry_date": "2026-11-16",
    "created_at": "2026-11-24T22:56:22.030041+05:30"
  }
]);

export const DASHBOARD = Object.freeze({
  "as_of": "2026-11-24",
  "total_projects": 5,
  "projects_by_status": {
    "PLANNED": 0,
    "ACTIVE": 4,
    "ON_HOLD": 0,
    "COMPLETED": 1,
    "CANCELLED": 0
  },
  "risk_by_level": {
    "LOW": 2,
    "MEDIUM": 1,
    "HIGH": 1,
    "CRITICAL": 1
  },
  "budget": {
    "planned_total": "1080000.00",
    "spent_total": "828500.00",
    "remaining_total": "251500.00",
    "utilization_pct": 76.7
  },
  "departments": [
    {
      "department_id": 1,
      "department_name": "Engineering",
      "planned_budget": "400000.00",
      "actual_spend": "300000.00"
    },
    {
      "department_id": 3,
      "department_name": "Finance",
      "planned_budget": "250000.00",
      "actual_spend": "137500.00"
    },
    {
      "department_id": 5,
      "department_name": "Human Resources",
      "planned_budget": "80000.00",
      "actual_spend": "76000.00"
    },
    {
      "department_id": 2,
      "department_name": "Marketing",
      "planned_budget": "150000.00",
      "actual_spend": "105000.00"
    },
    {
      "department_id": 4,
      "department_name": "Operations",
      "planned_budget": "200000.00",
      "actual_spend": "210000.00"
    }
  ],
  "over_allocated_count": 1,
  "top_risks": [
    {
      "project_id": 1,
      "project_name": "Project Alpha: Customer Payments Platform",
      "risk_score": 78,
      "risk_level": "CRITICAL",
      "headline": "2 deliverables are overdue: 'API Schema' (due 2026-11-19, 5 days late) and 'Data Migration Plan' (due 2026-11-21, 3 days late)."
    },
    {
      "project_id": 4,
      "project_name": "Project Delta: Warehouse Tracking Rollout",
      "risk_score": 61,
      "risk_level": "HIGH",
      "headline": "105.0% of the planned budget is consumed while deliverables are 55.0% complete."
    },
    {
      "project_id": 2,
      "project_name": "Project Beta: Brand Relaunch Campaign",
      "risk_score": 31,
      "risk_level": "MEDIUM",
      "headline": "'Campaign Creative' (4 days overdue) puts 2 downstream deliverables in this project at risk: 'Website Refresh' (depth 1) and 'Launch Event' (depth 1)."
    }
  ],
  "recent_activity": []
});

/** Project Alpha as GET /projects/1 returns it. */
export const ALPHA = PROJECTS[0];

/** The API's message when End-to-End Testing -> API Schema would close a loop (spec section 10). */
export const CYCLE_PATH = 'API Schema → Payments Service Integration → End-to-End Testing → API Schema';
export const CYCLE_MESSAGE = `This dependency would create a cycle: ${CYCLE_PATH}`;
