const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { verifyToken, checkRole } = require('./authMiddleware');
const app = express();
const port = 3000;

const secretKey = 'yourSecretKey';




app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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

sql.connect(config).then(pool => {
    if (pool.connecting) {
        console.log('Łączenie z bazą danych...');
    }
    if (pool.connected) {
        console.log('Połączono z bazą danych.');
    }
    const holidays = [
        '2024-01-01', '2024-01-06', '2024-03-31', ' 2024-04-01', '2024-05-01', '2024-05-03', '2024-05-19', '2024-05-30',
        '2024-08-15', '2024-11-01', '2024-11-11', '2024-12-25', '2025-01-01', '2025-01-06', ' 2025-03-20', '2025-03-21', '2025-05-01',
        '2025-05-03', '2025-06-08', '2025-06-19', '2025-08-15', '2025-11-01', '2025-11-11', '2025-12-25',
    ];

    function isHoliday(date) {
        const formattedDate = date.toISOString().split('T')[0];
        return holidays.includes(formattedDate);
    }

    function addWeeks(date, weeks) {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() + weeks * 7);
        return newDate;
    }

    async function createSessionsForGroup(groupId, startDay, startTime) {
        const startDate = new Date();
        const sessions = [];
        let count = 0;
        let currentDate = new Date(startDate);

        while (count < 30) {
            if (currentDate.getDay() === startDay && !isHoliday(currentDate)) {
                sessions.push({
                    group_id: groupId,
                    session_date: currentDate.toISOString().split('T')[0],
                    day_of_week: startDay,
                    time: startTime,
                });
                count++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (const session of sessions) {
            await sql.query`INSERT INTO Sessions (group_id, session_date, day_of_week, time) VALUES (${session.group_id}, ${session.session_date}, ${session.day_of_week}, ${session.time})`;
        }
    }

    app.post('/registerClient', async (req, res) => {
        const { username, password, role, firstName, lastName, email, phoneNumber } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        try {
            const existingUser = await pool.request()
                .input('username', sql.VarChar, username)
                .query('SELECT * FROM Users WHERE username = @username');

            if (existingUser.recordset.length > 0) {
                return res.status(400).json({ message: 'Nazwa użytkownika jest już zajęta' });
            }

            const userResult = await pool.request()
                .input('username', sql.VarChar, username)
                .input('password', sql.VarChar, hashedPassword)
                .input('role', sql.VarChar, role)
                .query('INSERT INTO Users (username, password, role) OUTPUT INSERTED.id VALUES (@username, @password, @role)');

            const userId = userResult.recordset[0].id;

            await pool.request()
                .input('userId', sql.Int, userId)
                .input('firstName', sql.VarChar, firstName)
                .input('lastName', sql.VarChar, lastName)
                .input('email', sql.VarChar, email)
                .input('phoneNumber', sql.VarChar, phoneNumber)
                .query('INSERT INTO Clients (user_id, first_name, last_name, email, phone_number) VALUES (@userId, @firstName, @lastName, @email, @phoneNumber)');

            res.status(201).send('Client registered successfully');
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    app.post('/login', async (req, res) => {
        const { username, password } = req.body;

        try {
            const result = await pool.request()
                .input('username', sql.VarChar, username)
                .query('SELECT * FROM Users WHERE username = @username');

            const user = result.recordset[0];
            if (user) {
                const validPassword = await bcrypt.compare(password, user.password);
                if (validPassword) {
                    const token = jwt.sign({ id: user.id, role: user.role }, secretKey, { expiresIn: '1h' });
                    res.json({ token });
                } else {
                    res.status(401).json({ message: 'Invalid username or password' });
                }
            } else {
                res.status(401).json({ message: 'Invalid username or password' });
            }
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });

    app.get('/role', verifyToken, (req, res) => {
        res.json({ role: req.user.role });
    });

    app.get('/admin/dashboard.html', verifyToken, checkRole('admin'), (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
    });

    app.get('/client/dashboard.html', verifyToken, checkRole('client'), (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'client', 'dashboard.html'));
    });

    app.get('/employee/dashboard.html', verifyToken, checkRole('employee'), (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'employee', 'dashboard.html'));
    });

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.post('/addChild', verifyToken, checkRole('client'), async (req, res) => {
        const { firstName, lastName, class: childClass } = req.body;
    
        try {
            // Sprawdź, czy użytkownik istnieje w tabeli Clients
            const clientResult = await pool.request()
                .input('userId', sql.Int, req.user.id)
                .query('SELECT id FROM Clients WHERE user_id = @userId');
    
            if (clientResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Client not found' });
            }
    
            const parentId = clientResult.recordset[0].id;
    
            // Dodaj dziecko do tabeli Children
            await pool.request()
                .input('parentId', sql.Int, parentId)
                .input('firstName', sql.VarChar, firstName)
                .input('lastName', sql.VarChar, lastName)
                .input('class', sql.Int, childClass)
                .query('INSERT INTO Children (parent_id, first_name, last_name, class) VALUES (@parentId, @firstName, @lastName, @class)');
    
            res.status(201).send('Child added successfully');
        } catch (err) {
            console.error('Error adding child:', err);
            res.status(500).send('Internal server error');
        }
    });
    



    app.get('/employee/editAvailability.html', verifyToken, checkRole('employee'), (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'employee', 'editAvailability.html'));
    });

    app.get('/employee/profile', verifyToken, checkRole('employee'), async (req, res) => {
        try {
            const userId = req.user.id;  // Assuming `id` is set in the JWT payload
    
            // Pobierz podstawowe dane pracownika oraz teacher_id z tabeli Employees
            const employeeResult = await sql.query`
                SELECT e.id AS teacher_id, e.first_name, e.last_name, e.availability_schedule
                FROM Employees e
                WHERE e.user_id = ${userId}
            `;
    
            if (employeeResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Employee not found' });
            }
    
            const employee = employeeResult.recordset[0];
            const teacherId = employee.teacher_id;
    
            // Pobierz liczbę zakończonych lekcji
            const lessonCountResult = await sql.query`
                SELECT COUNT(*) as lesson_count
                FROM Sessions s
                JOIN Groups g ON s.group_id = g.id
                WHERE g.teacher_id = ${teacherId}
                  AND s.status = 'completed'
            `;
            const lessonCount = lessonCountResult.recordset[0].lesson_count;
    
            // Pobierz liczbę grup prowadzonych przez nauczyciela
            const groupCountResult = await sql.query`
                SELECT COUNT(*) as group_count
                FROM Groups
                WHERE teacher_id = ${teacherId}
            `;
            const groupCount = groupCountResult.recordset[0].group_count;
    
            // Zwróć pełen profil pracownika
            res.json({
                first_name: employee.first_name,
                last_name: employee.last_name,
                teacher_id: teacherId,
                lesson_count: lessonCount,
                group_count: groupCount,
                availability_schedule: employee.availability_schedule
            });
        } catch (err) {
            console.error('Error fetching employee profile:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });
    
    
    




    app.get('/employee/lessonCount', verifyToken, checkRole('employee'), async (req, res) => {
        const teacherId = req.query.teacherId;
    
        if (!teacherId || isNaN(teacherId)) {
            return res.status(400).json({ message: 'Invalid teacher ID' });
        }
    
        try {
            const result = await pool.request()
                .input('teacherId', sql.Int, teacherId)
                .query(`
                    SELECT COUNT(*) AS count
                    FROM Sessions s
                    JOIN Groups g ON s.group_id = g.id
                    WHERE g.teacher_id = @teacherId AND s.status = 'completed'
                `);
            res.json(result.recordset[0]);
        } catch (err) {
            console.error('Error fetching lesson count:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });
    
    app.get('/employee/groupCount', verifyToken, checkRole('employee'), async (req, res) => {
        const teacherId = req.query.teacherId;
    
        if (!teacherId || isNaN(teacherId)) {
            return res.status(400).json({ message: 'Invalid teacher ID' });
        }
    
        try {
            const result = await pool.request()
                .input('teacherId', sql.Int, teacherId)
                .query(`
                    SELECT COUNT(*) AS count
                    FROM Groups
                    WHERE teacher_id = @teacherId
                `);
            res.json(result.recordset[0]);
        } catch (err) {
            console.error('Error fetching group count:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });
    

    
    
    


    app.get('/client/profile', verifyToken, checkRole('client'), async (req, res) => {
        try {
            const clientId = req.user.id;  // Assuming `id` is set in the JWT payload
            const result = await sql.query`
                SELECT first_name, last_name
                FROM Clients
                WHERE user_id = ${clientId}
            `;
            if (result.recordset.length === 0) {
                return res.status(404).json({ message: 'Client not found' });
            }
            res.json(result.recordset[0]);
        } catch (err) {
            console.error('Error fetching client profile:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });




    app.get('/client/groups', verifyToken, checkRole('client'), async (req, res) => {
        try {
            console.log('Fetching groups for user ID:', req.user.id);

            // Pobierz client_id na podstawie user_id
            const clientResult = await pool.request()
                .input('userId', sql.Int, req.user.id)
                .query('SELECT id FROM Clients WHERE user_id = @userId');

            if (clientResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Client not found' });
            }

            const clientId = clientResult.recordset[0].id;
            console.log('Client ID:', clientId);

            // Pobierz grupy dzieci klienta
            const result = await pool.request()
                .input('parentId', sql.Int, clientId)
                .query(`
                    SELECT g.name AS group_name, g.level, g.day_of_week AS day, g.time, c.first_name AS child_first_name, c.last_name AS child_last_name
                    FROM Groups g
                    JOIN ChildrenGroups cg ON g.id = cg.group_id
                    JOIN Children c ON cg.child_id = c.id
                    WHERE c.parent_id = @parentId
                `);

            console.log('Fetched groups:', result.recordset);

            res.json(result.recordset);
        } catch (err) {
            console.error('Error fetching client groups:', err);
            res.status(500).send('Internal server error');
        }
    });



    app.post('/client/addChildToGroup', verifyToken, checkRole('client'), async (req, res) => {
        const { childId, groupId } = req.body;

        try {
            // Dodaj dziecko do grupy
            await pool.request()
                .input('childId', sql.Int, childId)
                .input('groupId', sql.Int, groupId)
                .query('INSERT INTO ChildrenGroups (child_id, group_id) VALUES (@childId, @groupId)');

            res.status(201).json({ message: 'Dziecko zostało zapisane do grupy.' });
        } catch (err) {
            console.error('Błąd podczas zapisywania dziecka do grupy:', err.message);
            res.status(500).json({ message: 'Błąd serwera' });
        }
    });

    app.get('/client/availableGroups', verifyToken, checkRole('client'), async (req, res) => {
        try {
            const result = await pool.request()
                .query('SELECT * FROM Groups');
            res.json(result.recordset);
        } catch (err) {
            console.error('Błąd podczas pobierania dostępnych grup:', err.message);
            res.status(500).json({ message: 'Błąd serwera' });
        }
    });
    app.post('/client/searchGroups', verifyToken, checkRole('client'), async (req, res) => {
        const { course, level, day, time } = req.body;
    
        try {
            // Podstawowa kwerenda SQL
            let query = 'SELECT * FROM Groups WHERE 1=1';
    
            // Tablica parametrów do zapytania
            const params = {};
    
            // Dodaj warunki do kwerendy tylko, jeśli nie są puste
            if (course && course !== '') {
                query += ' AND department = @department';
                params.department = course;
            }
    
            if (level && level !== '') {
                query += ' AND level = @level';
                params.level = level;
            }
    
            if (day && day !== '') {
                query += ' AND day_of_week = @day_of_week';
                params.day_of_week = day;
            }
    
            if (time && time !== '') {
                query += ' AND time = @time';
                params.time = time;
            }
    
            // Przygotuj i wykonaj zapytanie z dynamicznymi parametrami
            const request = pool.request();
            for (const [key, value] of Object.entries(params)) {
                request.input(key, sql.VarChar, value);
            }
    
            const result = await request.query(query);
    
            res.json(result.recordset);
        } catch (err) {
            console.error('Error searching groups:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });
    

    app.get('/client/children', verifyToken, checkRole('client'), async (req, res) => {
        const userId = req.user.id; // To jest ID użytkownika

        try {
            // Znajdź ID klienta na podstawie user_id
            const clientResult = await pool.request()
                .input('userId', sql.Int, userId)
                .query('SELECT id FROM Clients WHERE user_id = @userId');

            if (clientResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Client not found' });
            }

            const clientId = clientResult.recordset[0].id;
            console.log('Client ID:', clientId);

            // Znajdź dzieci tego klienta
            const childrenResult = await pool.request()
                .input('parentId', sql.Int, clientId)
                .query('SELECT id, first_name, last_name, class FROM Children WHERE parent_id = @parentId');

            if (childrenResult.recordset.length === 0) {
                return res.status(404).json({ message: 'No children found' });
            }

            const children = childrenResult.recordset;

            // Filtruj dzieci na podstawie poziomu klasy
            const level = req.query.level;
            let minClass, maxClass;
            switch (level) {
                case '1':
                    minClass = 3;
                    maxClass = 4;
                    break;
                case '2':
                    minClass = 5;
                    maxClass = 6;
                    break;
                case '3':
                    minClass = 7;
                    maxClass = 8;
                    break;
                case '4':
                    minClass = 9;
                    maxClass = 10;
                    break;
                case '5':
                    minClass = 11;
                    maxClass = 12;
                    break;
                default:
                    return res.status(400).json({ message: 'Invalid level' });
            }

            const filteredChildren = children.filter(child => child.class >= minClass && child.class <= maxClass);

            if (filteredChildren.length === 0) {
                return res.status(404).json({ message: 'No children found for the selected level' });
            }

            res.json(filteredChildren);
        } catch (err) {
            console.error('Error fetching children:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });







    app.post('/client/joinGroup', verifyToken, checkRole('client'), async (req, res) => {
        const { groupId, childId } = req.body;

        try {

            const existingRecord = await pool.request()
                .input('groupId', sql.Int, groupId)
                .input('childId', sql.Int, childId)
                .query('SELECT * FROM ChildrenGroups WHERE group_id = @groupId AND child_id = @childId');

            if (existingRecord.recordset.length > 0) {
                return res.status(400).json({ message: 'Dziecko jest już zapisane do tej grupy' });
            }


            await pool.request()
                .input('groupId', sql.Int, groupId)
                .input('childId', sql.Int, childId)
                .query('INSERT INTO ChildrenGroups (group_id, child_id) VALUES (@groupId, @childId)');

            res.status(201).json({ message: 'Dziecko zostało zapisane do grupy' });
        } catch (err) {
            console.error('Błąd podczas zapisywania dziecka do grupy:', err.message);
            res.status(500).json({ message: 'Błąd serwera' });
        }
    });


    app.post('/admin/query', verifyToken, checkRole('admin'), async (req, res) => {
        const { query } = req.body;

        try {
            const result = await pool.request()
                .query(query);

            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });
    app.get('/admin/employees', verifyToken, checkRole('admin'), async (req, res) => {
        const department = req.query.department;

        try {
            const result = await pool.request()
                .input('department', sql.VarChar, department)
                .query('SELECT id, first_name, last_name FROM Employees WHERE department = @department');

            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    app.post('/admin/generateReport', verifyToken, checkRole('admin'), async (req, res) => {
        const { employeeId, month } = req.body;
        const startDate = new Date(month);
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

        try {
            const sessionsResult = await pool.request()
                .input('employeeId', sql.Int, employeeId)
                .input('startDate', sql.Date, startDate)
                .input('endDate', sql.Date, endDate)
                .query(`
                    SELECT s.session_date, g.name as group_name, s.status
                    FROM Sessions s
                    JOIN Groups g ON s.group_id = g.id
                    WHERE g.teacher_id = @employeeId AND s.session_date BETWEEN @startDate AND @endDate AND s.status = 'completed'
                `);

            const employeeResult = await pool.request()
                .input('employeeId', sql.Int, employeeId)
                .query('SELECT first_name, last_name, hourly_rate, department FROM Employees WHERE id = @employeeId');

            const employee = employeeResult.recordset[0];
            const completedSessions = sessionsResult.recordset.length;
            const totalPayment = completedSessions * employee.hourly_rate;

            const report = {
                employeeName: `${employee.first_name} ${employee.last_name}`,
                month: startDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
                department: employee.department,
                hourlyRate: employee.hourly_rate,
                completedSessions,
                totalPayment,
                sessions: sessionsResult.recordset
            };

            res.json(report);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });



    app.get('/employee/schedule', verifyToken, checkRole('employee'), async (req, res) => {
        try {
            const result = await pool.request()
                .input('teacherId', sql.Int, req.user.id)
                .query('SELECT g.name, g.level, g.day, g.time, g.id FROM Groups g WHERE g.teacher_id = @teacherId');

            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    app.get('/employee/class', verifyToken, checkRole('employee'), async (req, res) => {
        const classId = req.query.classId;

        try {
            const result = await pool.request()
                .input('classId', sql.Int, classId)
                .query('SELECT c.first_name, c.last_name, a.present FROM Children c LEFT JOIN Attendance a ON c.id = a.student_id WHERE c.group_id = @classId');

            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });
    app.get('/employees', verifyToken, checkRole('admin'), async (req, res) => {
        try {
            const result = await sql.query`SELECT * FROM Employees`;
            res.json(result.recordset);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Błąd serwera' });
        }
    });
    app.post('/employees', verifyToken, checkRole('admin'), async (req, res) => {
        const { first_name, last_name, email, phone_number, availability_schedule, supervisor_id, department, hourly_rate } = req.body;

        try {
            await sql.query`INSERT INTO Employees (first_name, last_name, email, phone_number, availability_schedule, supervisor_id, department, hourly_rate) 
                            VALUES (${first_name}, ${last_name}, ${email}, ${phone_number}, ${availability_schedule}, ${supervisor_id}, ${department}, ${hourly_rate})`;
            res.status(201).json({ message: 'Pracownik dodany pomyślnie' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Błąd serwera' });
        }
    });
    app.get('/admin/registerEmployee.html', verifyToken, checkRole('admin'), (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'admin', 'registerEmployee.html'));
    });
    app.post('/admin/registerEmployee', verifyToken, checkRole('admin'), async (req, res) => {
        const { firstName, lastName, email, phoneNumber, department, hourlyRate, username, password } = req.body;


        const existingUser = await pool.request()
            .input('username', sql.VarChar, username)
            .query('SELECT * FROM Users WHERE username = @username');

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ message: 'Użytkownik o takiej nazwie już istnieje.' });
        }


        const hashedPassword = await bcrypt.hash(password, 10);
        const userResult = await pool.request()
            .input('username', sql.VarChar, username)
            .input('password', sql.VarChar, hashedPassword)
            .input('role', sql.VarChar, 'employee')
            .query('INSERT INTO Users (username, password, role) OUTPUT INSERTED.id VALUES (@username, @password, @role)');

        const userId = userResult.recordset[0].id;


        const supervisorMap = {
            'Język angielski': 2,
            'Język niemiecki': 3,
            'Język hiszpański': 4,
            'Matematyka': 5,
            'Programowanie': 6,
            'Język Polski': 7,
            'Gitara': 8,
            'Szachy': 9
        };

        const supervisorId = supervisorMap[department];


        await pool.request()
            .input('firstName', sql.VarChar, firstName)
            .input('lastName', sql.VarChar, lastName)
            .input('email', sql.VarChar, email)
            .input('phoneNumber', sql.VarChar, phoneNumber)
            .input('department', sql.VarChar, department)
            .input('hourlyRate', sql.Decimal, hourlyRate)
            .input('userId', sql.Int, userId)
            .input('supervisorId', sql.Int, supervisorId)
            .query('INSERT INTO Employees (first_name, last_name, email, phone_number, department, hourly_rate, user_id, supervisor_id) VALUES (@firstName, @lastName, @email, @phoneNumber, @department, @hourlyRate, @userId, @supervisorId)');

        res.status(201).json({ message: 'Pracownik został zarejestrowany.' });
    });

    app.get('/admin/addGroup.html', verifyToken, checkRole('admin'), (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'admin', 'addGroup.html'));
    });

    app.post('/admin/addGroup', verifyToken, checkRole('admin'), async (req, res) => {
        const { department, day_of_week, time, teacherId, level } = req.body;
    
        try {
            // Sprawdź, czy nauczyciel istnieje
            const teacherResult = await pool.request()
                .input('teacherId', sql.Int, teacherId)
                .query('SELECT first_name, last_name FROM Employees WHERE id = @teacherId');
    
            if (teacherResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Nauczyciel nie znaleziony' });
            }
    
            const teacher = teacherResult.recordset[0];
            const groupName = `${department}_${teacher.first_name}_${teacher.last_name}_${day_of_week}_${time}`;
    
            // Dodanie grupy do bazy danych
            const result = await pool.request()
                .input('groupName', sql.VarChar, groupName)
                .input('department', sql.VarChar, department)
                .input('day_of_week', sql.VarChar, day_of_week)
                .input('time', sql.VarChar, time)
                .input('teacherId', sql.Int, teacherId)
                .input('level', sql.VarChar, level)
                .query(`DECLARE @OutputTable TABLE (id INT);
                        INSERT INTO Groups (name, department, day_of_week, time, teacher_id, level)
                        OUTPUT INSERTED.id INTO @OutputTable
                        VALUES (@groupName, @department, @day_of_week, @time, @teacherId, @level);
                        SELECT id FROM @OutputTable;`);
    
            const groupId = result.recordset[0].id;
    
            // Funkcja do tworzenia sesji dla nowej grupy
            const startDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day_of_week);
            await createSessionsForGroup(groupId, startDay, time);
    
            res.status(201).json({ message: 'Grupa została dodana pomyślnie wraz z sesjami.' });
        } catch (err) {
            console.error('Błąd podczas dodawania grupy:', err.message);
            res.status(500).json({ message: 'Błąd serwera' });
        }
    });
    

    app.get('/employee/sessions', verifyToken, checkRole('employee'), async (req, res) => {
        try {
            const userId = req.user.id;


            const employeeResult = await pool.request()
                .input('userId', sql.Int, userId)
                .query('SELECT id FROM Employees WHERE user_id = @userId');

            if (employeeResult.recordset.length === 0) {
                return res.status(404).json({ message: 'Employee not found' });
            }

            const employeeId = employeeResult.recordset[0].id;
            console.log('Employee ID:', employeeId);

            const result = await pool.request()
                .input('teacherId', sql.Int, employeeId)
                .query(`
                    SELECT s.id, s.group_id, s.session_date, s.day_of_week, s.time, s.status, g.name AS group_name
                    FROM Sessions s
                    JOIN Groups g ON s.group_id = g.id
                    WHERE g.teacher_id = @teacherId
                `);

            // console.log('Fetched sessions:', result.recordset);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });



    app.get('/test/sessions', async (req, res) => {
        try {
            const testTeacherId = 10;
            const result = await pool.request()
                .input('teacherId', sql.Int, testTeacherId)
                .query(`
                    SELECT s.id, s.group_id, s.session_date, s.day_of_week, s.time, s.status, g.name AS group_name
                    FROM Sessions s
                    JOIN Groups g ON s.group_id = g.id
                    WHERE g.teacher_id = @teacherId
                `);

            console.log('Fetched test sessions:', result.recordset);
            res.json(result.recordset);
        } catch (err) {
            console.error('Error fetching test sessions:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });


    app.get('/employee/session/:sessionId/students', verifyToken, checkRole('employee'), async (req, res) => {
        const { sessionId } = req.params;

        try {
            const result = await pool.request()
                .input('sessionId', sql.Int, sessionId)
                .query(`
                SELECT c.id, c.first_name, c.last_name
                FROM Children c
                JOIN ChildrenGroups cg ON c.id = cg.child_id
                JOIN Sessions s ON cg.group_id = s.group_id
                WHERE s.id = @sessionId
            `);

            res.json(result.recordset);
        } catch (err) {
            console.error('Error fetching students for session:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });


    app.post('/employee/attendance', verifyToken, checkRole('employee'), async (req, res) => {
        const { sessionId, present } = req.body;
    
        try {
            // Pobierz wszystkie dzieci z danej sesji
            const result = await pool.request()
                .input('sessionId', sql.Int, sessionId)
                .query(`
                    SELECT c.id
                    FROM Children c
                    JOIN ChildrenGroups cg ON c.id = cg.child_id
                    JOIN Sessions s ON cg.group_id = s.group_id
                    WHERE s.id = @sessionId
                `);
    
            const students = result.recordset;
    
            // Dodaj obecność dla każdego dziecka
            const attendancePromises = students.map(student => {
                return pool.request()
                    .input('sessionId', sql.Int, sessionId)
                    .input('studentId', sql.Int, student.id)
                    .input('present', sql.Bit, present)
                    .query('INSERT INTO Attendance (session_id, child_id, attended) VALUES (@sessionId, @studentId, @present)');
            });
    
            await Promise.all(attendancePromises);
    
            // Aktualizacja statusu sesji na 'completed'
            await pool.request()
                .input('sessionId', sql.Int, sessionId)
                .query('UPDATE Sessions SET status = \'completed\' WHERE id = @sessionId');
    
            res.status(201).send('Attendance recorded successfully');
        } catch (err) {
            console.error('Error recording attendance:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });
    



    app.post('/employee/attendance/individual', verifyToken, checkRole('employee'), async (req, res) => {
        const { sessionId, attendance } = req.body;

        try {
            const attendancePromises = attendance.map(record => {
                return pool.request()
                    .input('sessionId', sql.Int, sessionId)
                    .input('studentId', sql.Int, record.studentId)
                    .input('present', sql.Bit, record.present)
                    .query('INSERT INTO Attendance (session_id, child_id, attended) VALUES (@sessionId, @studentId, @present)');
            });

            await Promise.all(attendancePromises);

            await pool.request()
                .input('sessionId', sql.Int, sessionId)
                .query('UPDATE Sessions SET status = \'completed\' WHERE id = @sessionId');

            res.status(201).send('Individual attendance recorded successfully');
        } catch (err) {
            console.error('Error recording individual attendance:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });


    app.post('/employee/session/:sessionId/attendance', verifyToken, checkRole('employee'), async (req, res) => {
        const { sessionId } = req.params;
        const { attendance } = req.body;

        try {
            await pool.request()
                .input('sessionId', sql.Int, sessionId)
                .input('attendance', sql.NVarChar, JSON.stringify(attendance))
                .input('status', sql.NVarChar, 'completed')
                .query('UPDATE Sessions SET attendance = @attendance, status = @status WHERE id = @sessionId');

            res.status(200).json({ message: 'Attendance updated successfully' });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });



    app.get('/admin/availableTeachers', verifyToken, checkRole('admin'), async (req, res) => {
        const { department, day, time } = req.query;

        try {
            const query = `
                SELECT e.id, e.first_name, e.last_name
                FROM Employees e
                WHERE e.department = @department
                AND JSON_VALUE(e.availability_schedule, '$.${day.toLowerCase()}.enabled') = 'true'
                AND JSON_VALUE(e.availability_schedule, '$.${day.toLowerCase()}.start') <= @time
                AND JSON_VALUE(e.availability_schedule, '$.${day.toLowerCase()}.end') >= @time
                AND NOT EXISTS (
                    SELECT 1
                    FROM Groups g
                    WHERE g.teacher_id = e.id
                    AND g.day_of_week = @day
                    AND g.time = @time
                )
            `;

            const result = await pool.request()
                .input('department', sql.VarChar, department)
                .input('day', sql.VarChar, day)
                .input('time', sql.VarChar, time)
                .query(query);

            res.json(result.recordset);
        } catch (err) {
            console.error('Błąd pobierania dostępnych nauczycieli:', err);
            res.status(500).send({ message: 'Internal Server Error' });
        }
    });



    // Endpoint do pobierania grup
    app.get('/groups', verifyToken, async (req, res) => {
        try {
            const result = await pool.request()
                .query('SELECT * FROM Groups');

            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    app.post('/employee/availability', verifyToken, checkRole('employee'), async (req, res) => {
        try {
            const employeeId = req.user.id;  // Assuming `id` is set in the JWT payload
            const availability = req.body;
            await sql.query`
                UPDATE Employees
                SET availability_schedule = ${JSON.stringify(availability)}
                WHERE user_id = ${employeeId}
            `;
            res.json({ message: 'Availability updated successfully' });
        } catch (err) {
            console.error('Error updating availability:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });


    app.listen(port, () => {
        console.log(`Serwer działa na porcie ${port}`);
    });
}).catch(err => {
    console.error('Błąd połączenia: ' + err.message);
});
