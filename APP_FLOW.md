**Database tables:**

User\_table:  
user\_id, email, full\_name, phonenumber, role(employee, engineer, admin), password hash

Ticket table:  
ticket\_id, status, title, updated\_at, building\_id(fk), floor\_id(fk), seat\_id(fk), created\_by\_user\_id(fk-\>user\_table), assigned\_to\_user\_id(fk-\>user\_table), description, category, affected scope(Me \= P3, floor \= P2, Building \= P1), created\_at, escalation\_requested (T/F), escalation\_reason, priority, blocked\_reason, assigned\_at, resolved\_at, acknowledged\_at

Ticket notes table:  
Note\_id, Ticket\_id(fk-\>ticket\_id), user\_id(fk-\>user\_table), note\_text, created\_at

Ticket feedback table:  
feedback\_id (PK), ticket\_id (FK → ticket.ticket\_id), user\_id (FK → user\_table.user\_id), communication\_rating, resolution\_rating, comment, created\_at

Shared incidents table:  
Shared\_incident\_id, title, description, category, affected scope, status, progress update, building(fk), floor\_id(fk), created\_by\_user\_ID(fk), created at, and updated\_at

Shared incidents tickets table:  
Shared\_incident\_id(fk), ticket\_id(fk) \-\> make it composite primary key

Notifications table:  
notification\_id (PK), user\_id (FK → user\_table.user\_id), ticket\_id (FK → ticket.ticket\_id), message, is\_read (T/F), created\_at

Buildings table:  
Building\_id, building\_name

Floors table:  
Floor\_id, floor\_number, building\_id (FK)

Seats table:  
Seat\_id, seat\_number, floor\_id(FK)

**BRAINSTORMING**:  
Define user flows for each role: pages, modals, forms, data and core actions: main things each role needs to get done.

**FACILITY ADMIN FLOW:**  
Facility admin has their own login credentials already.  
Facility logs in \-\> dashboard \-\> list of all tickets with filters \-\> clear view of unassigned tickets so they can assign it to an engineer \-\> list of all employees with dropdown to switch roles from ‘not engineer’ to ‘engineer’

**FACILITY ADMIN PAGES:**

- Dashboard \- all tickets with a super clear unassigned section  
- Ticket Details  
- Employee page to manage roles  
- Facilities page to manage and add facilities  
- Shared incidents page  
- Notifications

**FACILITY ADMIN CORE ACTIONS:**

- Login  
- View all tickets  
- Search and filter  
- Acknowledge  
- Assign or re-assign tickets to engineers  
- View engineer workload  
- Manage employee roles  
- Manage facilities  
- Create and manage shared incidents  
- View metrics based on dashboard  
- Closes tickets

**FACILITY ADMIN UI:**

- Unassigned tickets list  
- Engineer workload panel and metrics cards  
- All tickets list with search and filter controls  
- Recent or high-priority incidents

**EMPLOYEE FLOW**:  
Login/create account \-\> create ticket \-\> check ticket updates \-\> make notes

**EMPLOYEE PAGES:**

- Shared login/create account  
- Employee dashboard  
- Create ticket form  
- Notifications  
- My tickets list  
- Ticket details

**EMPLOYEE CORE ACTIONS:**

- Register / login  
- create ticket  
- view own tickets  
- add note  
- request escalation  
- Search and filter

**EMPLOYEE UI:**

- Create ticket button  
- My tickets list  
- Search and filter  
- Recent or active ticket highlight  
- Happening near me section  
- In ticket details, status and progress section with notes and escalation action

**ENGINEER PAGES:**

- login/create account  
- Dashboard showing tickets assigned to them with filters  
- Tickets detail page  
- Notifications

**ENGINEER FLOW:**

Creates an account \-\> admin assigns engineer role \-\> sees assigned tickets \-\> marks ticket in progress \-\> begins working on ticket

See other tickets they are working on \-\> can add notes as well \-\> mark blocked  / reason why? \-\> resolved

**ENGINEER CORE ACTIONS:**

- Registers as employee then admin promotes it to engineer / login  
- View assigned tickets  
- Open ticket details  
- Mark in progress  
- Add notes  
- Marked blocked with a reason  
- Marked resolved

**ENGINEER UI:**

- Assigned tickets list  
- Search and filter  
- Current active ticket highlight card  
- In ticket details: full ticket info, status controls, add note section

**GENERAL UI REQUIREMENTS:**

- Shared header with notification bell  
- Responsive layouts for mobile and desktop  
- Clear form validation and loading states and error states  
- role based navigation with shared header

