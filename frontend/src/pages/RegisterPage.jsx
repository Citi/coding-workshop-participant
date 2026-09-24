import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import PropTypes from "prop-types";
import { useNavigate } from "react-router";

import AuthCard from "../components/AuthCard";
import PasswordField from "../components/PasswordField";
import { ApiError } from "../services/apiClient";
import { register } from "../services/authService";
import {
  MIN_PASSWORD_LENGTH,
  passwordStrength,
} from "../utils/passwordStrength";
import {
  REGISTER_FIELDS,
  validateRegisterField,
  validateRegisterForm,
} from "../utils/registerValidation";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  phone_number: "",
  password: "",
  confirm_password: "",
};

const FIELD_PROPS = {
  full_name: { label: "Full name", autoComplete: "name", required: true },
  email: {
    label: "Work email",
    type: "email",
    autoComplete: "email",
    required: true,
    hint: "Use your @acme.inc address.",
  },
  phone_number: { label: "Phone (optional)", type: "tel", autoComplete: "tel" },
  password: {
    label: "Password",
    autoComplete: "new-password",
    required: true,
  },
  confirm_password: {
    label: "Confirm password",
    autoComplete: "new-password",
    required: true,
  },
};

const PASSWORD_FIELDS = ["password", "confirm_password"];

/** Meter colors from too short (1) to strong (4); the empty bars are light grey. */
const STRENGTH_COLORS = { 1: "#B3261E", 2: "#E08A00", 3: "#056DAE", 4: "#2E7D4F" };

/**
 * Hint under the password: the minimum length, plus a four-bar meter and a label
 * ("Strong · at least 8 characters") once the user starts typing.
 */
function PasswordHint({ password }) {
  const rule = `at least ${MIN_PASSWORD_LENGTH} characters`;
  const strength = passwordStrength(password);
  if (!strength) return `At least ${MIN_PASSWORD_LENGTH} characters.`;
  return (
    <>
      <Box
        aria-hidden="true"
        sx={{ display: "flex", gap: 0.5, mt: 0.5, mb: 0.75 }}
      >
        {[1, 2, 3, 4].map((bar) => (
          <Box
            key={bar}
            data-testid="strength-bar"
            data-filled={bar <= strength.score}
            sx={{
              flex: 1,
              height: 4,
              borderRadius: 0.25,
              bgcolor:
                bar <= strength.score
                  ? STRENGTH_COLORS[strength.score]
                  : "#DDE5EC",
            }}
          />
        ))}
      </Box>
      {`${strength.label} · ${rule}`}
    </>
  );
}

PasswordHint.propTypes = {
  password: PropTypes.string.isRequired,
};

/**
 * Employee sign-up. Checks fields before sending, shows API errors next to the
 * matching field, and goes to sign-in with a success message when done.
 */
function RegisterPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const next = { ...values, [name]: value };
    setValues(next);
    // Once a field shows an error, re-check it as the user fixes it.
    if (errors[name])
      setErrors({ ...errors, [name]: validateRegisterField(name, next) });
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    // Don't nag about a field the user tabbed past without typing.
    if (values[name] || errors[name]) {
      setErrors({ ...errors, [name]: validateRegisterField(name, values) });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    const found = validateRegisterForm(values);
    setErrors(found);
    const firstInvalid = REGISTER_FIELDS.find((field) => found[field]);
    if (firstInvalid) {
      document.getElementById(`register-${firstInvalid}`).focus();
      return;
    }

    setSubmitting(true);
    try {
      const user = await register(values);
      navigate("/login", { state: { registeredEmail: user.email } });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError("Something went wrong. Please try again.");
      } else if (error.status === 409) {
        setErrors({ email: error.message });
      } else if (
        Object.keys(error.fieldErrors).some((f) => REGISTER_FIELDS.includes(f))
      ) {
        setErrors(error.fieldErrors);
      } else {
        setFormError(error.message);
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Use your ACME work email."
      footnote="New accounts start as Employee. A Facility Admin can give you Engineer access."
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.5}>
          {formError && <Alert severity="error">{formError}</Alert>}

          {REGISTER_FIELDS.map((field) => {
            const { hint, ...props } = FIELD_PROPS[field];
            const Field = PASSWORD_FIELDS.includes(field)
              ? PasswordField
              : TextField;
            const helperText =
              errors[field] ||
              (field === "password" ? (
                <PasswordHint password={values.password} />
              ) : (
                hint || " "
              ));
            return (
              <Field
                key={field}
                id={`register-${field}`}
                name={field}
                value={values[field]}
                onChange={handleChange}
                onBlur={handleBlur}
                error={Boolean(errors[field])}
                helperText={helperText}
                disabled={submitting}
                fullWidth
                // The strength meter is a block, which can't sit inside the default <p>.
                slotProps={{ formHelperText: { component: "div" } }}
                {...props}
              />
            );
          })}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            startIcon={
              submitting ? <CircularProgress size={18} color="inherit" /> : null
            }
          >
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}

export default RegisterPage;
