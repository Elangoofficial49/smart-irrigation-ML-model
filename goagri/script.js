// ==========================================================================
// GoAgri - Client-Side Validation and Interactivity
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const togglePasswordBtn = document.getElementById("togglePassword");
  const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPassword");

  // Toggle Password Visibility
  function setupPasswordToggle(btn, input) {
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      const isPassword = input.getAttribute("type") === "password";
      input.setAttribute("type", isPassword ? "text" : "password");
      
      const eyeOpen = btn.querySelector(".eye-open");
      const eyeOff = btn.querySelector(".eye-off");
      if (eyeOpen && eyeOff) {
        eyeOpen.style.display = isPassword ? "none" : "block";
        eyeOff.style.display = isPassword ? "block" : "none";
      }
    });
  }

  setupPasswordToggle(togglePasswordBtn, passwordInput);
  setupPasswordToggle(toggleConfirmPasswordBtn, confirmPasswordInput);

  // Field validation helpers
  function showError(input, errorId, message) {
    const errorEl = document.getElementById(errorId);
    const container = input.closest(".input-container");
    if (errorEl) errorEl.textContent = message;
    if (container) container.classList.add("has-error");
  }

  function clearError(input, errorId) {
    const errorEl = document.getElementById(errorId);
    const container = input.closest(".input-container");
    if (errorEl) errorEl.textContent = "";
    if (container) container.classList.remove("has-error");
  }

  // Clear errors as user types
  firstNameInput.addEventListener("input", () => clearError(firstNameInput, "firstNameError"));
  lastNameInput.addEventListener("input", () => clearError(lastNameInput, "lastNameError"));
  emailInput.addEventListener("input", () => clearError(emailInput, "emailError"));
  passwordInput.addEventListener("input", () => clearError(passwordInput, "passwordError"));
  confirmPasswordInput.addEventListener("input", () => clearError(confirmPasswordInput, "confirmPasswordError"));

  // Form submission validation
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    let isValid = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // First Name
    if (!firstNameInput.value.trim()) {
      showError(firstNameInput, "firstNameError", "First name is required");
      isValid = false;
    } else {
      clearError(firstNameInput, "firstNameError");
    }

    // Last Name
    if (!lastNameInput.value.trim()) {
      showError(lastNameInput, "lastNameError", "Last name is required");
      isValid = false;
    } else {
      clearError(lastNameInput, "lastNameError");
    }

    // Email
    if (!emailInput.value.trim()) {
      showError(emailInput, "emailError", "Email is required");
      isValid = false;
    } else if (!emailRegex.test(emailInput.value.trim())) {
      showError(emailInput, "emailError", "Please enter a valid email address");
      isValid = false;
    } else {
      clearError(emailInput, "emailError");
    }

    // Password
    if (!passwordInput.value) {
      showError(passwordInput, "passwordError", "Password is required");
      isValid = false;
    } else if (passwordInput.value.length < 8) {
      showError(passwordInput, "passwordError", "Password must be at least 8 characters");
      isValid = false;
    } else {
      clearError(passwordInput, "passwordError");
    }

    // Confirm Password
    if (!confirmPasswordInput.value) {
      showError(confirmPasswordInput, "confirmPasswordError", "Please confirm your password");
      isValid = false;
    } else if (confirmPasswordInput.value !== passwordInput.value) {
      showError(confirmPasswordInput, "confirmPasswordError", "Passwords do not match");
      isValid = false;
    } else {
      clearError(confirmPasswordInput, "confirmPasswordError");
    }

    if (isValid) {
      handleSignup({
        firstName: firstNameInput.value.trim(),
        lastName: lastNameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value
      });
    }
  });
});

// Placeholder handleSignup
function handleSignup(data) {
  console.log("Signup submitted successfully:", {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    passwordLength: data.password.length
  });
  alert("Sign up successful! Welcome to GoAgri, " + data.firstName + ".");
}

// Placeholder handleGoogleSignup
function handleGoogleSignup() {
  console.log("Google Sign Up clicked");
}
