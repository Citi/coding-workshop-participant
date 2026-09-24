# Employee Flow

## MVP

### Authentication

- Employee registers using an `@acme.inc` email address.
- Employee logs in using company email and password.
- After login, employee is taken to the Employee Dashboard.

---

## Employee Dashboard

### Main Dashboard Behavior

- Show the employee’s most recent active ticket prominently at the top.
- If the employee has no active tickets, show an appropriate empty state.
- Provide a highly visible **Create New Ticket** button.
- Show internal notifications for important ticket updates.

### Dashboard Statistics

Show basic visual statistics for the employee’s tickets, including:

- Total active tickets
- Tickets by status:
  - Open
  - In Progress
  - Blocked
  - Resolved
  - Closed

### Ticket List

Show the employee’s submitted tickets with core metadata:

- Ticket ID
- Title
- Status
- Impact (who is affected): Just me / My floor / Building
- Last updated date
- Building
- Floor
- Seat, when applicable

Employees should be able to:

- Search tickets by title, description or ticket number
- Filter by status
- Toggle between active and closed tickets
- Click a ticket to open its full details

---

## Create Ticket Flow

Employee selects **Create New Ticket** and provides:

### Basic Information

- Title
- Description
- Category

Category options:

- Network / Internet
- Computer / Hardware
- Printer / Peripheral
- HVAC / Temperature
- Electrical / Power
- Furniture / Workspace
- Building Facilities
- Other

### Location

Use the facility hierarchy:

**Building → Floor → Seat**

The employee only selects the levels applicable to the issue.

Examples:

- Building-wide issue → Building
- Floor-wide issue → Building → Floor
- Workstation issue → Building → Floor → Seat

### Affected Scope

Employee answers **Who is affected?**:

- Just me (Seat / Local Workstation)
- My floor
- Building

Affected scope alone sets the initial internal priority:

- Just me → P3
- My floor → P2
- Building → P1

Employees never see priority; they see impact (who is affected) and status.

Tickets have no urgency level and no short description.

The Facility Admin can review and override the final priority.

---

### Incident Notes

While the incident is open, the employee can:

- Add notes
- Add additional information
- Communicate with the assigned engineer through ticket notes

Engineer updates and employee notes appear as part of the ticket history.

### Escalation

Employee can **request escalation** if the issue becomes more serious or is not being resolved appropriately.

The employee provides an escalation reason.

The Facility Admin reviews the escalation request and can adjust the ticket priority.

---

## Employee Ticket Requirements

Every employee ticket must:

- Be linked to the employee who submitted it
- Have a title and description
- Have a category
- Have an affected scope
- Have a priority
- Have a status
- Have an applicable location using the Building → Floor → Seat hierarchy
- Show the assigned engineer when one has been assigned
- Track when the ticket was created
- Track when the ticket was acknowledged
- Track when the ticket was assigned
- Track when the ticket was resolved
- Track when the ticket was last updated
- Allow employee notes on open incidents
- Allow the employee to request escalation
- Support the workflow:

**Open → In Progress → Blocked → Resolved → Closed**

---

## MVP

## Employee Happening Near Me View

Shared incidents appear on the Employee Dashboard under **Happening Near Me**.

Each shared incident can show:

- Title
- Description
- Category
- Relevant location
- Affected scope
- Status
- Progress update
- Last updated date

Example progress updates:

- Investigating
- Fixing
- Parts ordered

Do **not** expose another employee’s ticket ID, notes, or private ticket information.

---

# Duplicate Incident Prevention

## MVP

While an employee creates a ticket, the system checks whether an active shared incident already matches the information being entered.

For the MVP, comparison can use:

- Category
- Building
- Floor
- Seat
- Affected scope

A match does not have to use every location level.

For example, a shared incident may affect:

- One seat
- One floor
- An entire building

If an active shared incident is found, show a message before the employee creates another ticket.

Example:

> “We are already tracking a network outage affecting Floor 3 of Building A. View the existing incident to see its current status and updates.”

The employee can:

- View the existing shared incident
- Decide not to create a duplicate ticket
- Continue creating a separate ticket if their problem is actually different

The purpose is to reduce duplicate tickets while still allowing distinct issues to be reported.

---

# Ticket Closure Feedback

## MVP

After a ticket is closed, the employee can complete a short feedback survey.

The survey can include:

- Communication rating
- Resolution rating
- Optional comment

This allows Facility Admins to measure how effectively employees are being informed about ticket progress and outcomes.

---

# Future / Nice-to-Have Features

These are intentionally outside the first MVP build.

## Attachments

Allow employees to upload:

- Screenshots
- Error logs
- Images
- Other supporting files
- Drag-and-drop uploads

## Specific Asset Tracking

Extend location from:

**Building → Floor → Seat**

to:

**Building → Floor → Seat → Specific Asset**

Examples:

- Monitor
- Docking station
- Printer
- Conference-room equipment

## Departments

- Link employees or tickets to departments
- Use departments as another shared-incident grouping dimension

## Shared Incident Improvements

Later versions can compare incidents using:

- Department
- Specific asset
- Device type
- System or service
- More advanced similarity rules

## Shared Incident Subscriptions

Allow employees to explicitly follow / subscribe to a shared incident and receive updates when it changes.

## Preferred Contact Methods

Allow employees to choose:

- Email
- Phone
- Slack
- Teams
