require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const pgp = require('pg-promise')();
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const db = pgp(process.env.DATABASE_URL);

app.use(cors());
app.use(bodyParser.json());

// Get all books
app.get('/api/books', async (req, res) => {
    try {
        const books = await db.any('SELECT * FROM books');

        // Format the book data
        const formattedBooks = books.map(book => ({
            id: book.id,
            isbn: book.isbn,
            title: book.title,
            author: book.author,
            genre: book.genre,
            price: parseFloat(book.price).toFixed(2) // Ensure price is a float and formatted
        }));

        res.json(formattedBooks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Get book by ID
app.get('/api/books/:isbn', async (req, res) => {
    const { isbn } = req.params;
    try {
        const book = await db.one('SELECT * FROM books WHERE isbn = $1', [isbn]);
        res.json(book);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Add a new book
app.post('/api/books', async (req, res) => {
    const { isbn, title, author, genre, price } = req.body;
    try {
        const newBook = await db.one(
            'INSERT INTO books (isbn, title, author, genre, price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [isbn, title, author, genre, price]
        );
        res.status(201).json(newBook);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add multiple books
app.post('/api/books/bulk', async (req, res) => {
    const books = req.body;

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
                    'INSERT INTO books (isbn, title, author, genre, price) VALUES ($1, $2, $3, $4, $5)',
                    [book.isbn, book.title, book.author, book.genre, book.price]
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
    const { title, author, genre, price } = req.body;
    try {
        const updatedBook = await db.one(
            'UPDATE books SET title = $1, author = $2, genre = $3, price = $4 WHERE id = $5 RETURNING *',
            [title, author, genre, price, id]
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

//Delete multiple books
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


// Cart operations
let cart = [];
//Add to cart
app.post('/api/cart', (req, res) => {
    const { bookId, quantity } = req.body;
    const book = cart.find((item) => item.bookId === bookId);
    if (book) {
        book.quantity += quantity;
    } else {
        cart.push({ bookId, quantity });
    }
    res.json(cart);
});

//Display cart
app.get('/api/cart', (req, res) => {
    res.json(cart);
});

//Order by user
app.post('/api/order', async (req, res) => {
    const { userId } = req.body; // Assuming user is logged in

    try {
        // Check if the user exists
        const user = await db.oneOrNone('SELECT * FROM users WHERE id = $1', [userId]);

        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Calculate the total price of the cart
        const total = cart.reduce((acc, item) => {
            return acc + (item.quantity * (item.price || 0));
        }, 0);

        // Insert the order into the database
        const order = await db.one(
            'INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING *',
            [userId, total]
        );

        // Clear the cart after placing the order
        cart = [];

        res.status(201).json(order);
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

//Advanced search
app.get('/api/advanced-search', async (req, res) => {
    const { title, author, genre, minPrice, maxPrice } = req.query;
    let sqlQuery = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    if (title) {
        sqlQuery += ` AND title ILIKE $${params.length + 1}`;
        params.push(`%${title}%`);
    }

    if (author) {
        sqlQuery += ` AND author ILIKE $${params.length + 1}`;
        params.push(`%${author}%`);
    }

    if (genre) {
        sqlQuery += ` AND genre = $${params.length + 1}`;
        params.push(genre);
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

// Filter books
app.get('/api/filter', async (req, res) => {
    const { genre, author, minPrice, maxPrice } = req.query;

    // Start building the SQL query
    let sqlQuery = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    // Add conditions based on the presence of query parameters
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




