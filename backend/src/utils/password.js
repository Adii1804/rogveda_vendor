const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const hash = (password) => bcrypt.hash(password, SALT_ROUNDS);

const compare = (password, hashed) => bcrypt.compare(password, hashed);

// PRD: 6-digit numeric temporary password
const generateTemp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = { hash, compare, generateTemp };
