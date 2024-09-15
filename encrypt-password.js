const sql = require('mssql');
const bcrypt = require('bcryptjs');

const config = {
    server: 'localhost',
    user: 'myUser',
    password: 'myPassword',
    database: 'EducationDB',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function encryptPassword(username, plainPassword) {
    try {
        await sql.connect(config);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        await sql.query`UPDATE Users SET password = ${hashedPassword} WHERE username = ${username}`;
        console.log(`Hasło dla użytkownika ${username} zostało zaszyfrowane`);
        sql.close();
    } catch (err) {
        console.error('Błąd:', err);
    }
}

const users = [
    { username: 'admin', password: 'adminpass' },
    { username: 'angielski_kord', password: 'angielskipass' },
    { username: 'niemiecki_kord', password: 'niemieckipass' },
    { username: 'hiszpanski_kord', password: 'hiszpanskiepass' },
    { username: 'matematyka_kord', password: 'matematykapass' },
    { username: 'programowanie_kord', password: 'programowaniepass' },
    { username: 'polski_kord', password: 'polskipass' },
    { username: 'gitara_kord', password: 'gitarapass' },
    { username: 'szachy_kord', password: 'szachypass' }
];

(async () => {
    for (const user of users) {
        await encryptPassword(user.username, user.password);
    }
})();