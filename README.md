# Educational-platform-managing-system
This project is an Educational Platform designed to manage classes, students, and teachers. It offers functionalities for users with different roles, including clients, teachers, and administrators. The platform was developed as part of a course on Industrial Database Systems.

#Features
User Registration and Login:

Role-based user system (Client, Teacher, Administrator).
Login with JWT-based authentication.
Role-based access to different sections of the platform.
Teacher Availability Management:

Interface for teachers to edit their availability.
Availability stored and retrieved from the database.
Student Enrollment in Classes:

User-friendly form to enroll students in classes.
Availability verification and class compatibility checks.
Prevention of duplicate enrollments for the same student.
Class Management:

Display and manage the groups to which students are enrolled.
Search functionality for groups based on set criteria.
Manage groups and assign teachers.
Attendance Tracking:

Interface to register student attendance in classes.
Session status updates after attendance registration.
Bulk attendance marking for all students in a group.
Teacher Payroll Generation:

Generate payrolls based on the department and month.
Preview and simulate sending payroll via email.
Calculate total classes and teacher compensation.

#Technologies Used
Frontend: HTML, CSS, JavaScript, jQuery, FullCalendar.
Backend: Node.js, Express.js.
Database: Microsoft SQL Server.
Authorization: JSON Web Token (JWT).

#Installation and Setup Instructions
Prerequisites
SQL Server: Download and install SQL Server (Express or another version as required).
SQL Server Management Studio (SSMS): Download and install SQL Server Management Studio.
Node.js: Download and install Node.js.
Setting up the Database
Open SQL Server Management Studio (SSMS) and connect to your SQL Server instance.
Create a new database:
Right-click on Databases and select New Database....
Name your database and click OK.
Load the provided SQL script:
Right-click on the newly created database and select New Query.
Load the script.sql from the project package and click Execute to create tables and insert initial data.

#Running the Application
Open a terminal or command prompt and navigate to the project directory:

bash

cd /path/to/project/education_app
Install the required Node.js packages:

bash

npm install
Start the application server:

bash

npm start
Open your browser and visit http://localhost:3000 to access the application.

#Troubleshooting
User Role Verification Issues:

JWT token validation issues were resolved through additional logging and token verification mechanisms.
Class Time Display Issues:

Formatting issues were fixed by correctly formatting date and time data.
Database Conflicts:

Issues with deleting records in the database were solved by introducing cascading deletion of related records.

#Future Enhancements
Expand notification features for users.
Introduce additional reports and statistics.
Integrate with external educational services.

#Acknowledgements
The project was completed as part of the Industrial Database Systems course. Special thanks to Tutore.eu for inspiration.
