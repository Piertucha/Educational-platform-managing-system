const jwt = require('jsonwebtoken');
const secretKey = 'yourSecretKey';

function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    console.log('Authorization Header:', authHeader);  // Debugging line
    if (!authHeader) {
        return res.status(403).send('Token jest wymagany do autoryzacji');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).send('Token jest wymagany do autoryzacji');
    }

    try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded;
        console.log('Decoded Token:', decoded);  // Debugging line
        next();
    } catch (err) {
        console.error('Token verification failed:', err.message);  // Debugging line
        return res.status(401).send('Nieprawidłowy token');
    }
}

function checkRole(role) {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).send('Dostęp zabroniony');
        }
        next();
    };
}

module.exports = {
    verifyToken,
    checkRole
};
