require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const pgp = require('pg-promise')();
const jwt = require('jsonwebtoken');
const PORT = process.env.PORT || 10000;
const multer = require('multer');
const streamifier = require('streamifier');
const cloudinary = require('cloudinary').v2;

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(process.env.CLOUDINARY_CLOUD_NAME)
    console.log(process.env.CLOUDINARY_API_KEY)
    console.log(process.env.CLOUDINARY_API_SECRET)
});

const db = pgp(process.env.DATABASE_URL);

const allowedOrigins = ['http://localhost:5174', 'https://web-project-07u1.onrender.com']; // Add multiple origins here

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true // Ensure credentials is outside of the origin function
}));

app.use(bodyParser.json());

// Authenticate Token Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract Bearer token

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

//Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Define a list of admin usernames
        const adminUsernames = ['Admin1', 'Admin2', 'Admin3']; // Add your admin usernames here

        // Check if the username or email already exists
        const existingUser = await db.oneOrNone(
            'SELECT * FROM userz WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already in use' });
        }

        // Determine user role
        const role = adminUsernames.includes(username) ? 'admin' : 'user';

        // Insert new user
        const newUser = await db.one(
            'INSERT INTO userz (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, email, password, role] // Make sure to hash the password before storing
        );

        res.status(201).json(newUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


//Login
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;

    try {
        // Find user by username or email
        const user = await db.oneOrNone(
            'SELECT * FROM userz WHERE username = $1 OR email = $2',
            [identifier, identifier]
        );

        if (!user || user.password !== password) { // Use hashed passwords in production
            return res.status(401).json({ error: 'Invalid username/email or password' });
        }

        // Generate JWT token
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);

        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//get users
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.any('SELECT * FROM userz');

        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//get user
app.get('/api/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Query the database to get user details
        const user = await db.oneOrNone('SELECT * FROM userz WHERE id = $1', [userId]);

        if (user) {
            return res.json({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                // Include any other fields you need
            });
        } else {
            return res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

//Update profile
app.put('/api/profile/update', authenticateToken, upload.single('profile_pic'), async (req, res) => {
    const { username, email, currentPassword, newPassword } = req.body;

    try {
        let profilePicUrl = null;

        if (req.file) {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'profile_pictures' },
                async (error, result) => {
                    if (error) {
    console.error('Cloudinary upload failed:', error);
    return res.status(500).json({ error: 'Cloudinary upload failed' });
  }
                    profilePicUrl = result.secure_url;

                    // Update the user in the database
                    await db.none(
                        `UPDATE userz SET username=$1, email=$2, profile_pic_url=$3 WHERE id=$4`,
                        [username, email, profilePicUrl, req.user.id]
                    );

                    return res.json({ username, email, profile_pic_url: profilePicUrl });
                }
            );
            streamifier.createReadStream(req.file.buffer).pipe(stream);
        } else {
            // Update without changing profile picture
            await db.none(
                `UPDATE userz SET username=$1, email=$2 WHERE id=$3`,
                [username, email, req.user.id]
            );

            return res.json({ username, email });
        }
    } catch (err) {
        res.status(500).json({ error: 'Profile update failed' });
    }
});

// Get books
app.get('/api/books', async (req, res) => {
    try {
        const books = await db.any('SELECT * FROM books');

        // Format the book data
        const formattedBooks = books.map(book => ({
            id: book.id,
            isbn: book.isbn,
            title: book.title,
            author: book.author.join(', '), // Convert array to string
            genre: book.genre.join(', '), // Convert array to string
            price: parseFloat(book.price).toFixed(2), // Ensure price is a float and formatted
            image_url: book.image_url,
            description: book.description,
            username: book.username // Include the username
        }));

        res.json(formattedBooks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get book by ISBN
app.get('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const book = await db.one('SELECT * FROM books WHERE id = $1', [id]);
        book.author = book.author.join(', ');
        book.genre = book.genre.join(', ');
        res.json(book);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a new book
app.post('/api/books', async (req, res) => {
    const { isbn, title, author, genre, price, image_url, description } = req.body;
    const username = req.body.username ? req.body.username : 'Admin'; // Default to 'Admin' if username is not available
    try {
        const newBook = await db.one(
            `INSERT INTO books (isbn, title, author, genre, price, image_url, description, username)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [isbn, title, author, genre, price, image_url, description, username]
        );
        res.status(201).json(newBook);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Add multiple books
app.post('/api/books/bulk', authenticateToken, async (req, res) => {
    const books = req.body;
    const username = req.user ? req.user.username : 'Admin'; // Default to 'Admin' if username is not available

    // Validate that the books array is provided and is an array
    if (!Array.isArray(books)) {
        return res.status(400).json({ error: 'Invalid input: Expected an array of books' });
    }

    // Check that each book in the array has the required fields
    for (const book of books) {
        if (!book.isbn || !book.title || !book.price) {
            return res.status(400).json({ error: 'Each book must have an ISBN, title, and price' });
        }
    }

    try {
        // Use a transaction to ensure all books are inserted or none are inserted
        await db.tx(async (t) => {
            for (const book of books) {
                await t.none(
                    'INSERT INTO books (isbn, title, author, genre, price, image_url, description, username) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                    [book.isbn, book.title, book.author, book.genre, book.price, book.image_url, book.description, username]
                );
            }
        });

        res.status(201).json({ message: 'Books added successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update an existing book
app.put('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    const { title, author, genre, price, image_url, description } = req.body;
    try {
        const updatedBook = await db.one(
            'UPDATE books SET title = $1, author = $2, genre = $3, price = $4, image_url = $5, description = $6 WHERE id = $7 RETURNING *',
            [title, author, genre, price, image_url, description, id]
        );
        res.json(updatedBook);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a book
app.delete('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.none('DELETE FROM books WHERE id = $1', [id]);
        res.sendStatus(204);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete multiple books
app.post('/api/books/multiple', async (req, res) => {
    const { ids } = req.body;

    // Validate that ids is an array and contains elements
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid input: Expected an array of book IDs' });
    }

    try {
        // Convert all IDs to integers
        const integerIds = ids.map(id => parseInt(id, 10));

        // Check if all IDs are valid integers
        if (integerIds.some(isNaN)) {
            return res.status(400).json({ error: 'Invalid input: All IDs must be integers' });
        }

        // Delete books using the ANY() clause with an integer array
        await db.none('DELETE FROM books WHERE id = ANY($1::int[])', [integerIds]);

        res.status(200).json({ message: 'Books deleted successfully' });
    } catch (err) {
        console.error("Error in deleting books:", err); // Log the detailed error
        res.status(500).json({ error: err.message });
    }
});

// Delete all books
app.delete('/api/books', async (req, res) => {
    try {
        await db.none('DELETE FROM books');
        await db.none('ALTER SEQUENCE books_id_seq RESTART WITH 1');
        res.status(200).json({ message: 'All books deleted successfully, and ID sequence reset' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Search books
app.get('/api/search', async (req, res) => {
    const { query, genre, author, minPrice, maxPrice } = req.query;

    // Start building the SQL query
    let sqlQuery = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    // Add conditions based on the presence of query parameters
    if (query) {
        sqlQuery += ` AND (title ILIKE $1 OR author ILIKE $1 OR genre ILIKE $1)`;
        params.push(`%${query}%`);
    }

    if (genre) {
        sqlQuery += ` AND genre = $${params.length + 1}`;
        params.push(genre);
    }

    if (author) {
        sqlQuery += ` AND author ILIKE $${params.length + 1}`;
        params.push(`%${author}%`);
    }

    if (minPrice) {
        sqlQuery += ` AND price >= $${params.length + 1}`;
        params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
        sqlQuery += ` AND price <= $${params.length + 1}`;
        params.push(parseFloat(maxPrice));
    }

    try {
        const books = await db.any(sqlQuery, params);
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Advanced search
app.get('/api/advanced-search', async (req, res) => {
    const { title, author, genre, minPrice, maxPrice } = req.query;
    let query = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    if (title) {
        query += ` AND title ILIKE $${params.length + 1}`;
        params.push(`%${title}%`);
    }

    if (author) {
        query += ` AND author ILIKE $${params.length + 1}`;
        params.push(`%${author}%`);
    }

    if (genre) {
        query += ` AND genre ILIKE $${params.length + 1}`;
        params.push(`%${genre}%`);
    }

    if (minPrice) {
        query += ` AND price >= $${params.length + 1}`;
        params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
        query += ` AND price <= $${params.length + 1}`;
        params.push(parseFloat(maxPrice));
    }

    try {
        const books = await db.any(query, params);
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Filter books by genre, author, and price range
app.get('/api/filter', async (req, res) => {
    const { genre, author, minPrice, maxPrice } = req.query;

    let sqlQuery = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    if (genre) {
        sqlQuery += ` AND $1 = ANY(genre)`;
        params.push(genre);
    }

    if (author) {
        sqlQuery += ` AND $2 = ANY(author)`;
        params.push(author);
    }

    if (minPrice) {
        sqlQuery += ` AND price >= $${params.length + 1}`;
        params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
        sqlQuery += ` AND price <= $${params.length + 1}`;
        params.push(parseFloat(maxPrice));
    }

    try {
        const books = await db.any(sqlQuery, params);
        const formattedBooks = books.map(book => ({
            id: book.id,
            isbn: book.isbn,
            title: book.title,
            author: book.author.join(', '),
            genre: book.genre.join(', '),
            price: parseFloat(book.price).toFixed(2),
            image_url: book.image_url,
            description: book.description
        }));
        res.json(formattedBooks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
