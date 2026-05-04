const ok = (res, data, statusCode = 200) => {
    res.status(statusCode).json({ success: true, data });
};

const created = (res, data) => ok(res, data, 201);

const error = (res, message, statusCode = 400, details = null) => {
    const body = { success: false, error: message };
    if (details) body.details = details;
    res.status(statusCode).json(body);
};

module.exports = { ok, created, error };
