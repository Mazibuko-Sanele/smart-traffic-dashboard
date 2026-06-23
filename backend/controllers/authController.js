exports.login = (req, res) => {
    const { email, password } = req.body;

    if (email === "admin@gmail.com" && password === "1234") {
        return res.json({ success: true, token: "dummy_token" });
    }

    res.status(400).json({ success: false, msg: "Invalid credentials" });
};
