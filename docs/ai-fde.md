# Coding Workshop - AI Forward Deployed Engineer Guide

> [Main Guide](./README.md) | [Validation Guide](./validation.md) | **AI FDE Guide** | [Data Engineer Guide](./data-engineer.md) | [Full Stack Guide](./full-stack.md) | [System Engineer Guide](./system-engineer.md) | [UI/UX Engineer Guide](./ui-ux-engineer.md)

## Overview

This guide provides directions and guidelines on implementation expectations but you are free to exercise your creativity to showcase your technical skills combined with soft skills such as curiosity, observability, and ability to drive / deliver value.

* [Architecture Diagram](#architecture-diagram)
* [Evaluation Expectations](#evaluation-expectations)
* [Testing Expectations](#testing-expectations)
* [Implementation Expectations](#implementation-expectations)

## Architecture Diagram

There are no architecture diagrams provided up-front. AI FDEs are expected to create them as part of their engagements with non-technical stakeholders.

## Evaluation Expectations

Candidates are evaluated on five technical competencies (specifically: 1. Requirements, 2. Implementation, 3. Testing, 4. Experience, 5. Presentation) and three soft skills (specifically: 1. Curious, 2. Observant, 3. Driven). Each technical competency is scored on a scale of 1 (lowest) to 10 (highest). The technical assessment result is the average of those scores. The soft skills are evaluated using the same scoring approach. The final overall evaluation is the average of the technical and soft skills results, as follows:

Evaluation    | Excellent     | Good          | Satisfactory   | Incomplete
--------------|---------------|---------------|----------------|-----------
*Score Range* | *9 or higher* | *7 or higher* | *5 or higher*  | *below 5*

Here below are more details on the technical competencies expectations:

1. **Requirements**

  - Problem framing is clear, measurable, and aligned to business outcomes.
  - Stakeholder goals, constraints, and success criteria are explicitly captured.
  - Functional and non-functional requirements are prioritized and traceable.
  - AI-specific requirements (grounding, citations, guardrails, HITL, auditability) are defined up front.
  - Assumptions, risks, and open questions are documented with mitigation paths.

2. **Implementation**

  - Application runs successfully in local development and cloud environments.
  - AI agent correctly retrieves relevant context via LLM and/or RAG and generates grounded responses with citations.
  - Human-in-the-loop approval is properly and reasonably used to align with business goals and/or expectations.
  - Infrastructure dependencies (compute, storage, security, data, AI, etc.) are configured correctly.
  - Deployment process is reproducible with verifiable outputs.

3. **Testing**

  - Unit tests cover agent tool functions, retrieval logic, and guardrail rules in isolation.
  - Integration tests validate the end-to-end RAG pipeline and human-in-the-loop flow.
  - Manual validation confirms the full user journey from inquiry submission through analyst approval.
  - Test artifacts (commands, results, and known gaps) are documented clearly.

4. **Experience**

  - Project can be set up and run locally using documented commands with minimal friction.
  - README/update notes clearly explain architecture, AI design decisions, trade-offs, and assumptions.
  - User and analyst flows provide clear feedback for loading, approval, and failure states.
  - Logging and operational visibility make debugging and support straightforward.
  - Delivery quality demonstrates ownership, clarity, and maintainability.

5. **Presentation**

  - Demonstrates a clear narrative from business problem to technical solution.
  - Explains architecture and design choices in language understandable to non-technical stakeholders.
  - Presents measurable value realization mapped to target outcomes and/or KPIs.
  - Highlights responsible-AI posture with examples of citations, guardrails, and human oversight.
  - Communicates trade-offs, limitations, and next-step roadmap with confidence.

## Testing Expectations

### Backend & Agent Testing

1. Unit Tests: Test individual agent tool functions, retrieval utilities, and guardrail logic in isolation.
2. Integration Tests: Test the full RAG pipeline with actual vector database connections and LLM calls (or mocked LLM responses).
3. Guardrail Tests: Validate that out-of-scope, harmful, or hallucinated responses are correctly intercepted.
4. Human-in-the-Loop Tests: Confirm that flagged responses enter the approval queue and are only delivered after analyst sign-off.

### Frontend Testing

1. Component Tests: Test React components using Jest and React Testing Library.
2. API Integration Tests: Test API service functions with mocked responses.
3. End-to-End Tests: Test complete user workflows (submit inquiry → receive AI response → analyst approves) using tools like Cypress or Selenium.

### Performance Testing

1. Latency Testing: Measure end-to-end response time from inquiry submission to AI-generated answer delivery.
2. Load Testing: Test API endpoints under concurrent load using tools like Artillery or JMeter.
3. Retrieval Quality Testing: Evaluate retrieval precision and recall against a sample set of known HR inquiries and expected source documents.

### Test Coverage Goals

* Agent tool functions and retrieval logic: 80%+ coverage
* Guardrail and safety rules: 90%+ coverage
* API endpoints: 90%+ coverage for all operations
* Error handling and retry paths: 85%+ coverage
* Critical user journeys (submit → retrieve → approve → respond): 100% E2E test coverage

### Examples: How To Test

#### Local Development

To test your backend agent service locally:

```sh
# Example: Submit an inquiry to the AI agent service
curl -X POST https://localhost:3001/api/{{service-name}} \
     -H "Content-Type: application/json" \
     -d '{"question": "What is the leave policy for new joiners?"}'
```

Replace `{{service-name}}` with your service name (e.g. `python-service`).

To tail backend logs in real-time:

```sh
# Example: Get logs for {{service-name}}
AWS_ENDPOINT_URL="http://localhost.localstack.cloud:4566" \
    aws logs tail /aws/lambda/{{function-name}} \
        --follow --format short --color on
```

Replace `{{function-name}}` with corresponding service name
(e.g. `coding-workshop-python-service-abcd1234`).

#### Cloud Deployment

To test your backend agent service in the cloud:

```sh
# Example: Submit an inquiry to the AI agent service
curl -X POST https://{API_BASE_URL}/api/{{service-name}} \
     -H "Content-Type: application/json" \
     -d '{"question": "What is the leave policy for new joiners?"}'
```

To tail backend logs in real-time:

```sh
# Example: Get logs for {{service-name}}
aws logs tail /aws/lambda/{{function-name}} \
    --follow --format short --color on
```

Replace `{{function-name}}` with corresponding service name
(e.g. `coding-workshop-python-service-abcd1234`).

## Implementation Expectations

### 1. AI Agent Service

The AI agent is the core of the solution, responsible for understanding HR inquiries, retrieving relevant knowledge, generating grounded responses, and enforcing responsible-AI controls.

**Expected Capabilities**

- [ ] Receive unstructured HR inquiries via API and route them to the agent
- [ ] Retrieve relevant context from a vector store using RAG (Retrieval-Augmented Generation)
- [ ] Generate responses grounded in retrieved documents with source citations
- [ ] Apply guardrails to intercept hallucinated, out-of-scope, or policy-violating outputs
- [ ] Route sensitive categories through a human-in-the-loop approval step before delivery
- [ ] Emit structured traces and logs via MLflow and OpenTelemetry for auditability

**Key Attributes to Consider**

- Groundedness and citation accuracy (no hallucination)
- Responsible-AI controls (guardrails, human-in-the-loop, audit trail)
- Latency and response quality under realistic load
- Modularity: agent tools, retrieval, and guardrails should be independently testable
- Observability: every LLM call, retrieval step, and guardrail decision should be traceable

**How to Create New Backend Services**

Python is the recommended coding language option, but we also added support for Java and NodeJS.

To create a new backend service from an example, just run the following command:

```sh
cp -R ../backend/_examples/{{coding-language}}-service ../backend/{{service-name}}
```

Replace `{{coding-language}}` with either `python`, `java` or `nodejs`, as well as `{{service-name}}` with your corresponding new service name.

When you create a new backend service, make sure to restart the development environment:

```sh
../bin/start-dev.sh
```

### 2. Knowledge Base & Vector Store

The knowledge base holds the HR documents, runbooks, and policy PDFs that the AI agent retrieves context from.

**Expected Capabilities**

- [ ] Ingest and chunk HR documents (PDFs, wiki pages, ticket history) into vector embeddings
- [ ] Store embeddings in PostgreSQL with pgvector or MongoDB with Vector Search
- [ ] Retrieve the top-K most semantically relevant chunks for a given inquiry
- [ ] Associate each retrieved chunk with its source document for citation
- [ ] Support incremental document ingestion without full re-indexing

**Database Environment Variables**

Predefined environment variables are injected into your execution environment automatically:

| Variable        | Description           | Local                  | Cloud                   |
| --------------- | --------------------- | ---------------------- | ----------------------- |
| `IS_LOCAL`      | Is it local or cloud? | `true`                 | `false`                 |
| `POSTGRES_HOST` | PostgreSQL hostname   | `localhost`            | AWS Aurora endpoint     |
| `POSTGRES_PORT` | PostgreSQL port       | `5432`                 | `5432`                  |
| `POSTGRES_NAME` | PostgreSQL name       | *(empty)*              | AWS Aurora database     |
| `POSTGRES_USER` | PostgreSQL username   | *(empty)*              | AWS Aurora username     |
| `POSTGRES_PASS` | PostgreSQL password   | *(empty)*              | AWS Aurora password     |
| `MONGO_HOST`    | MongoDB hostname      | `host.docker.internal` | AWS DocumentDB endpoint |
| `MONGO_PORT`    | MongoDB port          | `27017`                | `27017`                 |
| `MONGO_NAME`    | MongoDB db name       | *(empty)*              | AWS DocumentDB database |
| `MONGO_USER`    | MongoDB username      | *(empty)*              | AWS DocumentDB username |
| `MONGO_PASS`    | MongoDB password      | *(empty)*              | AWS DocumentDB password |

> [!NOTE]
> Use `IS_LOCAL` to branch your connection logic. PostgreSQL locally runs without SSL; when `IS_LOCAL` is `false`, add `sslmode=require` for AWS Aurora. MongoDB locally runs without TLS; when `IS_LOCAL` is `false`, add `tls=True`, `tlsAllowInvalidCertificates=True`, and `retryWrites=False` for AWS DocumentDB.

### 3. Responsible AI & Guardrails

Every AI-generated response must be safe, grounded, and auditable.

**Expected Capabilities**

- [ ] Block or flag responses that exceed a configurable hallucination confidence threshold
- [ ] Enforce topic scope (responses must only address HR Operations topics)
- [ ] Redact or refuse responses involving personally identifiable information (PII) in unsanctioned contexts
- [ ] Attach source citations to every AI-generated response
- [ ] Log every guardrail decision (pass / flag / block) with input, output, and rule triggered
- [ ] Route flagged responses to a human reviewer queue before delivery to the end user

### 4. Human-in-the-Loop Approval Flow

Sensitive categories require human analyst review before the AI-generated response reaches the end user.

**Expected Capabilities**

- [ ] Classify each inquiry into a sensitivity tier (e.g. standard / sensitive / escalation)
- [ ] Queue sensitive responses for analyst review with the original inquiry, AI answer, and citations displayed side-by-side
- [ ] Allow analysts to approve, edit, or reject AI-generated responses
- [ ] Deliver only approved responses to the end user
- [ ] Maintain an immutable audit trail of all approval decisions

### 5. Frontend User Interface

The frontend provides a self-service portal for operators and analysts to submit inquiries, view AI-generated answers, and manage the approval queue.

**Expected Capabilities**

- [ ] Responsive and accessible design across common screen sizes
- [ ] Inquiry submission form with real-time status feedback (processing → approved → delivered)
- [ ] Display AI-generated answers with inline source citations
- [ ] Analyst approval queue view: side-by-side inquiry, AI answer, citations, and approve / edit / reject actions
- [ ] Audit log view: history of all inquiries, AI responses, guardrail decisions, and approval outcomes

### 6. Observability & Auditability

All AI decisions must be traceable for compliance, debugging, and continuous improvement.

**Expected Capabilities**

- [ ] Instrument every LLM call with MLflow tracing (input, output, model name, latency, and token usage)
- [ ] Emit OpenTelemetry spans for agent tool invocations, retrieval steps, and guardrail evaluations
- [ ] Log structured `INFO`, `WARN`, and `ERROR` events for all pipeline stages
- [ ] Store an immutable record of every inquiry, retrieved context, AI response, guardrail outcome, and human decision
- [ ] Expose a health-check endpoint that reports agent, vector store, and LLM gateway connectivity status

### 7. Error Handling & Resilience

**Common Error Conditions & Handling:**

| Error Condition | Impact | Recommended Resolution Strategy |
| --------------- | ------ | -------------------------------- |
| **LLM API Timeout** | No response generated. | Implement retry logic with exponential backoff; surface a user-friendly degraded-mode message. |
| **Vector Store Unavailable** | No context retrieved; agent falls back to parametric knowledge only. | Log warning, flag response as low-confidence, route to human review. |
| **Guardrail Block** | Response withheld from user. | Log guardrail rule triggered; notify analyst queue for manual handling. |
| **PII Detected in Response** | Compliance risk. | Redact automatically; log incident; escalate to compliance review. |
| **Empty Retrieval (No Relevant Chunks)** | Agent lacks grounding context. | Respond with a transparent "no relevant documentation found" message; do not hallucinate. |
| **Database Connection Timeout** | Embeddings cannot be stored or queried. | Retry with backoff; alert on repeated failures. |

## Navigation Links

<nav aria-label="breadcrumb">
  <ol>
    <li><a href="./README.md">Main Guide</a></li>
    <li><a href="./validation.md">Validation Guide</a></li>
    <li aria-current="page">AI FDE Guide</li>
    <li><a href="./data-engineer.md">Data Engineer Guide</a></li>
    <li><a href="./full-stack.md">Full Stack Guide</a></li>
    <li><a href="./system-engineer.md">System Engineer Guide</a></li>
    <li><a href="./ui-ux-engineer.md">UI/UX Engineer Guide</a></li>
  </ol>
</nav>
