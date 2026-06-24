document.getElementById("loginForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const rememberMe = document.getElementById("rememberMe").checked;
  const errorBox = document.getElementById("loginError");

  errorBox.innerText = "";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!data.success) {
      errorBox.innerText = data.message || "Invalid email or password";
      return;
    }

    // Store token — sessionStorage if not remembered, localStorage if remembered
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem("token", data.token);

    window.location.href = "/dashboard";

  } catch (err) {
    console.error(err);
    errorBox.innerText = "Server error. Please try again.";
  }
});