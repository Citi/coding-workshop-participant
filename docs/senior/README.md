# Coding Workshop - Senior Engineering Guide

> [Main Guide](../README.md) | [Validation Guide](../validation.md) | [Full Stack Guide](../full-stack.md) | **Senior Engineering Guide**

This guide is for candidates attending the **one-day Senior Engineering Coding Workshop** for **Senior Full Stack Engineer** roles. Read it before the day. No other preparation is needed, and there is no take-home task.

* [What this workshop is](#what-this-workshop-is)
* [The day](#the-day)
* [Ground rules](#ground-rules)
* [What to deliver](#what-to-deliver)
* [What we evaluate](#what-we-evaluate)
* [Technology and repository](#technology-and-repository)
* [Tips from the organizers](#tips-from-the-organizers)

## What this workshop is

The workshop is the interview. In one day you will do the work this role does:

1. **Discover**: understand a business problem from a non-technical stakeholder. The problem statement is written at a high level **on purpose**; the details you need come from asking good questions.
2. **Design**: decide the MVP, the architecture, the data model and the API contracts, and plan the work.
3. **Lead the build**: deliver working, tested software by directing an AI coding agent the way you would lead a team of engineers. You own everything it produces.
4. **Defend**: explain your decisions, trade-offs and next steps to an evaluation panel, and discuss your technical depth and leadership experience.

## The day

| Time | What happens |
| :--- | :----------- |
| **08:30** | Arrive, sign in to your pre-configured workspace, activate your AI coding agent access. |
| **09:00** | Welcome and briefing; you receive the business problem by email. |
| **09:30** | Discovery and design. The **business stakeholder** is available all day at the stakeholder desk. |
| **From 10:30** | **Design checkpoint** (20 minutes, your slot is on your card): present your plan to your evaluation panel. |
| **All day** | Build. Lunch is served at your desk around 12:00. |
| **From 13:00** | **1:1 with your evaluation panel** (45 minutes, your slot is on your card). You may be invited to demo (up to 15 minutes); a demo is not required. |
| **16:00** | **Code freeze.** Everything must be pushed to your repository. |
| **16:00 – 16:15** | Close and next steps. |

### Design checkpoint (20 minutes)

Spend about 10 minutes presenting your plan, in whatever form you choose: how you understand the problem, what you will deliver, and how you will deliver it. The panel will then ask questions. We want to see your thinking, not slides.

### 1:1 with the panel (45 minutes)

A structured technical and leadership conversation, grounded in what you did today: your solution and its code, your design decisions, how you directed the AI agent, technical depth in your chosen stack and the role's fundamentals (APIs, SQL and relational databases, microservices and event-driven design, React, cloud, containers), how you'd adapt to a different stack, and how you lead teams and delivery. Expect "why?" and "show me" questions. It's fine to say "I don't know"; tell us how you would find out.

## Ground rules

* **Ask the stakeholder.** Ask anything about the business, users, rules and priorities. Questions are asked privately, one candidate at a time. Technical choices are yours: the stakeholder won't tell you how to build it.
* **Use AI.** Use GitHub Copilot, Claude Code or another AI coding agent (a Claude Code subscription is provided). We expect the agent to write much of the code **under your direction**. You are accountable for every line.
* **Internet and documentation are allowed.** Help from other people (in the room or remotely) is not: the work must be yours.
* **Environment problems are not your problem.** If the workspace, tools or cloud environment misbehave, tell an organizer straight away. They will fix it, and time lost to the environment is not held against you.
* **Organizers won't coach.** This is a senior workshop: you won't get hints on the solution.
* **Code freeze is 16:00** for everyone. Only what is pushed by then counts.

## What to deliver

* A working MVP that meets the scenario's **minimum**, **deployed to AWS** with the repository's scripts and working end to end. Deployment is part of the minimum, not a stretch goal.
* Everything pushed to the repository you are given by **16:00**.

What else goes into the repository is your call. We look at it the way a team inheriting your work would: could someone else understand what you built and why, run it, test it, and carry it forward, with or without an AI agent?

## What we evaluate

Two evaluators assess every candidate independently against the same written standard, and then calibrate together. We look at:

**Technical**

* **Requirements & Scoping**: turning an ambiguous problem into a clear, measurable, prioritized MVP.
* **Design & Architecture**: a sound, right-sized design: data model, boundaries, API contracts, security, non-functional needs and trade-offs.
* **AI-Agent Orchestration**: how effectively you direct and oversee your AI coding agent.
* **Implementation & Code Quality**: working, end-to-end software with sound structure, error handling and security.
* **Testing & Quality Engineering**: tests that prove the parts that matter.
* **Experience & Operability**: a usable, responsive product that others can run and understand.
* **Technical Depth & Adaptability**: depth in your chosen stack and the role's fundamentals, and ease working across stacks.
* **Presentation & Communication**: clear explanations to technical and non-technical audiences.

**Leadership and behaviours**

* **Technical Leadership & Strategy**: setting direction and standards, leading and growing teams, thinking beyond the MVP.
* **Delivery Leadership & Risk**: planning, prioritizing, time-boxing and managing risk and scope in a rapid, AI-enabled agile model.
* **Curious, Observant, Driven**: understanding the "why", noticing the details that matter, and owning the outcome.

How much you build matters, but **how you lead the work matters as much**. A smaller, well-designed, well-tested MVP that you fully understand beats a large one you can't explain.

## Technology and repository

* **Front end:** React (Material UI available). **Back end:** Java, Python or NodeJS (your choice; all three are weighted equally), running as AWS Lambda services. **Database:** PostgreSQL. **Cloud:** AWS serverless, via the repository's Terraform and scripts.
* Your workspace is pre-configured. The [Validation Guide](../validation.md) explains the environment, and the [Full Stack Guide](../full-stack.md) is a useful **technical reference** (architecture, service layout, environment variables, how to test and deploy). Its *Evaluation Expectations* section describes the entry-level workshop; for this workshop, use [What we evaluate](#what-we-evaluate) above.
* New back-end services go **one level under `backend/`**. Start from `backend/_examples/{java|python|nodejs}-service`. See the [Backend Guide](../../backend/README.md).

## Tips from the organizers

* Talk to the stakeholder early. The best plans come from the best questions.
* Each scenario lists a **minimum** for the MVP and some **stretch goals**. Complete the minimum before the stretch.
* Get a thin slice working end to end **and deployed to AWS** early, then redeploy as you go. Cloud deployment takes time; don't leave the first one until the afternoon.
* Commit and push regularly. Don't leave it until 15:59.
