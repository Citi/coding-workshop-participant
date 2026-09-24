import PropTypes from "prop-types";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import BlockIcon from "@mui/icons-material/Block";
import CheckIcon from "@mui/icons-material/Check";
import PauseIcon from "@mui/icons-material/Pause";

import useIsMobile from "../../hooks/useIsMobile";
import { brand } from "../../theme";
import { STATUSES } from "../../utils/ticketFormat";
import { workflowState } from "../../utils/ticketWorkflow";

const NODE = 24;
const LINE = "#BDBDBD";
const BLOCKED = STATUSES.blocked.dot;

// Hidden visually but read by screen readers.
const srOnly = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

const STATE_TEXT = {
  done: "done",
  current: "current status",
  paused: "paused while blocked",
  upcoming: "not reached yet",
};

function Node({ state }) {
  const filled = state === "done" || state === "current";
  const color =
    { paused: BLOCKED, blocked: BLOCKED, upcoming: LINE, optional: LINE }[
      state
    ] ?? brand.blue;
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: NODE,
        height: NODE,
        flexShrink: 0,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        color: filled || state === "blocked" ? "common.white" : color,
        bgcolor: filled
          ? brand.blue
          : state === "blocked"
            ? BLOCKED
            : "background.paper",
        border: 2,
        borderColor: color,
        borderStyle: state === "optional" ? "dashed" : "solid",
        boxShadow:
          state === "current"
            ? `0 0 0 4px ${brand.page}, 0 0 0 6px ${brand.blue}`
            : "none",
      }}
    >
      {state === "done" && <CheckIcon sx={{ fontSize: 16 }} />}
      {state === "paused" && <PauseIcon sx={{ fontSize: 16 }} />}
      {state === "blocked" && <BlockIcon sx={{ fontSize: 16 }} />}
    </Box>
  );
}

Node.propTypes = {
  state: PropTypes.oneOf([
    "done",
    "current",
    "paused",
    "upcoming",
    "blocked",
    "optional",
  ]).isRequired,
};

/** The Blocked side state, hanging off "In progress". */
function BlockedBranch({ active, reason, vertical }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: vertical ? "row" : "column",
        alignItems: vertical ? "flex-start" : "center",
        gap: 1,
        mt: 1,
        ml: vertical ? 1 : 0,
        pl: vertical ? 2 : 0,
        borderLeft: vertical ? `2px dashed ${active ? BLOCKED : LINE}` : "none",
      }}
    >
      {!vertical && (
        <Box
          aria-hidden="true"
          sx={{
            height: 16,
            borderLeft: `2px dashed ${active ? BLOCKED : LINE}`,
          }}
        />
      )}
      <Node state={active ? "blocked" : "optional"} />
      <Box sx={{ textAlign: vertical ? "left" : "center", maxWidth: 220 }}>
        <Typography
          fontWeight={active ? 700 : 400}
          color={active ? "text.primary" : "text.secondary"}
        >
          Blocked
          {/* The engineer's reason, right next to the label. */}
          {active && reason && `: ${reason}`}
          {active && (
            <Box component="span" sx={srOnly}>
              {" "}
              (current status)
            </Box>
          )}
        </Typography>
      </Box>
    </Box>
  );
}

BlockedBranch.propTypes = {
  active: PropTypes.bool.isRequired,
  reason: PropTypes.string,
  vertical: PropTypes.bool.isRequired,
};

/**
 * Visual ticket workflow: Open -> In progress -> Resolved -> Closed, with Blocked
 * as an optional side state off "In progress" rather than a required step.
 * Horizontal on larger screens, vertical on phones.
 */
function TicketWorkflow({ status, blockedReason }) {
  const vertical = useIsMobile();
  const { steps, blocked } = workflowState(status);

  return (
    <Box
      component="ol"
      aria-label="Ticket workflow"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "flex",
        flexDirection: vertical ? "column" : "row",
      }}
    >
      {steps.map((step, index) => {
        const reached = step.state !== "upcoming";
        const nextReached =
          index < steps.length - 1 && steps[index + 1].state !== "upcoming";
        return (
          <Box
            component="li"
            key={step.status}
            aria-current={
              step.state === "current" || step.state === "paused"
                ? "step"
                : undefined
            }
            sx={{
              flex: 1,
              position: "relative",
              display: "flex",
              flexDirection: vertical ? "row" : "column",
              alignItems: vertical ? "flex-start" : "center",
              gap: vertical ? 1.5 : 1,
              pb: vertical && index < steps.length - 1 ? 3 : 0,
              // Connector to the next step: across on desktop, down on phones.
              "&::after": index < steps.length - 1 && {
                content: '""',
                position: "absolute",
                bgcolor: nextReached ? brand.blue : LINE,
                ...(vertical
                  ? { left: NODE / 2 - 1, top: NODE + 4, bottom: 4, width: 2 }
                  : {
                      top: NODE / 2 - 1,
                      left: `calc(50% + ${NODE / 2 + 6}px)`,
                      right: `calc(-50% + ${NODE / 2 + 6}px)`,
                      height: 2,
                    }),
              },
            }}
          >
            <Node state={step.state} />
            <Box sx={{ textAlign: vertical ? "left" : "center" }}>
              <Typography
                fontWeight={step.state === "current" ? 700 : 400}
                color={reached ? "text.primary" : "text.secondary"}
              >
                {STATUSES[step.status].label}
                <Box component="span" sx={srOnly}>
                  {" "}
                  ({STATE_TEXT[step.state]})
                </Box>
              </Typography>
              {step.status === "in_progress" && (
                <BlockedBranch
                  active={blocked}
                  reason={blockedReason}
                  vertical={vertical}
                />
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

TicketWorkflow.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUSES)).isRequired,
  blockedReason: PropTypes.string,
};

export default TicketWorkflow;
