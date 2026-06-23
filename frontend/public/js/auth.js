document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (email === "admin@gmail.com" && password === "1234") {
        localStorage.setItem("loggedIn", "true");
        window.location.href = "/dashboard";
    } else {
        document.getElementById("loginError").innerText = "Invalid login";
    }
});
