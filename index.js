import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import passport from "passport";
import session from "cookie-session";
import { Strategy } from "passport-local";
import bcrypt from "bcryptjs";

const app = express();
const port = 3000;
const saltRounds = 10;

env.config();


const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
})

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1
    }
}))

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect("/login");
}

function ensureIsAdmin(req, res, next) {
    if (req.user.is_admin) {
        return next();
    }
    console.log("not admin, cannot enter the add-product page");
    res.redirect("/");
}

var globalMessage = {
    type: "",
    content: "",
    subcontent: "",
    setMessage(type, content, subcontent) {
        this.type = type;
        this.content = content;
        this.subcontent = subcontent;
    },
    getMessage() {
        const temp = { ... this };
        this.type = this.content = this.subcontent = "";
        return temp;
    }
};

app.get("/", async (req, res) => {
    try {
        const client = await pool.connect();
        const products = await client.query("SELECT * FROM products ORDER BY created_at DESC");

        res.render("index.ejs", { user: req.user, products: products.rows, message: globalMessage.getMessage() });
    } catch (error) {
        res.render("index.ejs");
    }
})

app.get("/register", (req, res) => {
    res.render("register.ejs", { user: req.user, message: globalMessage.getMessage() });
})

app.get("/login", (req, res) => {
    res.render("login.ejs", { user: req.user, message: globalMessage.getMessage() });
})

app.get("/admin", ensureAuthenticated, ensureIsAdmin, async (req, res) => {
    console.log(req.user);
    try {
        const client = await pool.connect();

        const categories = await client.query("SELECT * FROM categories");
        const products = await client.query("SELECT * FROM products");
        res.render("admin_page.ejs", { user: req.user, categories: categories.rows, products: products.rows });
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.get("/product/:id", async (req, res) => {
    const product_id = req.params.id;

    try {
        const client = await pool.connect();
        const product = await client.query("SELECT * FROM products WHERE product_id = $1", [product_id]);
        res.render("product.ejs", { user: req.user, product: product.rows[0] });
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.get("/cart", ensureAuthenticated, async (req, res) => {
    const user_id = req.user.user_id;
    try {
        const client = await pool.connect();
        const carts = await client.query("SELECT * FROM carts c JOIN products p ON p.product_id = c.product_id WHERE c.user_id = $1", [user_id]);

        res.render("cart.ejs", { user: req.user, carts: carts.rows });
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.get("/transaction", ensureAuthenticated, async (req, res) => {
    try {
        const client = await pool.connect();
        const transactions = await client.query("SELECT * FROM transaction_header th JOIN transaction_detail td ON td.transaction_id = th.transaction_id JOIN products p ON p.product_id = td.product_id WHERE th.user_id = $1 ORDER BY transaction_date DESC", [req.user.user_id]);

        res.render("transaction.ejs", { user: req.user, transactions: transactions.rows });
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.get("/profile", ensureAuthenticated, async (req, res) => {
    try {
        const client = await pool.connect();
        const addresses = await client.query("SELECT * FROM addresses WHERE user_id = $1", [req.user.user_id]);

        res.render("profile.ejs", { user: req.user, address: addresses.rows[0], message: globalMessage.getMessage() })
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.post("/edit-profile", ensureAuthenticated, async (req, res) => {
    const username = req.body.username;
    const email = req.body.email;

    console.log(req.body.username);
    console.log("username: ", username, "|email: ", email);

    if (username === req.user.username && email === req.user.email) {
        globalMessage.setMessage("warning", "No changes made", "Make sure you enter different username or email to update")
    } else {
        try {
            const client = await pool.connect();
            const user = await client.query("SELECT * FROM users WHERE username = $1 AND email = $2", [username, email]);
            if (user.rowCount === 0) {
                await client.query("UPDATE users SET username = $1, email = $2 WHERE user_id = $3", [username, email, req.user.user_id]);
                globalMessage.setMessage("success", "Changes made successfully", "Be sure to remember the new one")
                console.log("changes made")
            } else {
                globalMessage.setMessage("danger", "Username or email already exists", "Please choose a different one");
            }
        } catch (error) {
            globalMessage.setMessage("danger", "An error occured while updating", "Please try again");
        }
    }
    res.redirect("/profile");
})

app.post("/logout", (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500); 
        }
        req.session.destroy((err) => {
            if (err) {
                console.error(err);
            }
            globalMessage.setMessage("success", "Account logged out successfully", "Make sure you come back 😊");
            res.clearCookie("session"); // Clear the session cookie
            res.redirect("/"); // Redirect to the homepage
        });
    });
});

app.post("/address", ensureAuthenticated, async (req, res) => {
    const street_address = req.body.street_address;
    const city = req.body.city;
    const state = req.body.state;
    const zip_code = req.body.zip_code;

    try {
        const client = await pool.connect();
        const address = await client.query("SELECT * FROM addresses WHERE user_id = $1", [req.user.user_id]);
        if (address.rowCount > 0) {
            // update
            globalMessage.setMessage("success", "Address updated successfully", "This address will be used for future delivery");
            await client.query("UPDATE addresses SET street_address = $1, city = $2, state = $3, zip_code = $4 WHERE user_id = $5", [street_address, city, state, zip_code, req.user.user_id]);
        } else {
            // create
            globalMessage.setMessage("success", "Address created successfully", "This address will be used for future delivery");
            await client.query("INSERT INTO addresses (user_id, street_address, city, state, zip_code) VALUES ($1, $2, $3, $4, $5)", [req.user.user_id, street_address, city, state, zip_code]);
        }
        res.redirect("/profile");
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.post("/checkout", ensureAuthenticated, async (req, res) => {
    try {
        const client = await pool.connect();
        const address = await client.query("SELECT * FROM addresses WHERE user_id = $1", [req.user.user_id]);

        if (address.rowCount === 0) {
            // if address not set
            globalMessage.setMessage("warning", "Address not set", "Please fill in your address first");
            res.redirect("/profile");
        } else {
            // if address is set
            const carts = await client.query("SELECT * FROM carts WHERE user_id = $1", [req.user.user_id]);

            await client.query("BEGIN");

            const transaction = await client.query("INSERT INTO transaction_header (user_id) VALUES ($1) RETURNING *", [req.user.user_id]);
            const transactionId = transaction.rows[0].transaction_id;

            const updateStockPromises = carts.rows.map(c => {
                return client.query("UPDATE products SET stock = stock - $1 WHERE product_id = $2", [c.quantity, c.product_id]);
            });

            await Promise.all(updateStockPromises);

            const insertDetailPromises = carts.rows.map(c => {
                return client.query("INSERT INTO transaction_detail (transaction_id, product_id, quantity) VALUES ($1, $2, $3)",
                    [transactionId, c.product_id, c.quantity]);
            });

            await Promise.all(insertDetailPromises);

            await client.query("DELETE FROM carts WHERE user_id = $1", [req.user.user_id]);

            await client.query("COMMIT");

            res.redirect("/cart");
        }
    } catch (error) {
        const client = await pool.connect();
        await client.query("ROLLBACK");
        console.error(error);
        res.redirect("/");
    }

})

app.post("/delete-cart", ensureAuthenticated, async (req, res) => {
    const cart_id = req.body.cart_id;

    try {
        const client = await pool.connect();
        await client.query("DELETE FROM carts WHERE cart_id = $1", [cart_id]);

        res.redirect("/cart");
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.post("/add-to-cart", ensureAuthenticated, async (req, res) => {
    const user_id = req.user.user_id;
    const product_id = req.body.product_id;
    const quantity = parseInt(req.body.quantity);

    try {
        const client = await pool.connect();
        const checkExistingItem = await client.query("SELECT * FROM carts WHERE user_id = $1 AND product_id = $2", [user_id, product_id]);

        // if there is already the item user trying to add to cart, just add the quantity
        if (checkExistingItem.rowCount > 0) {
            const cart = checkExistingItem.rows[0];
            const updateQuantity = quantity + parseInt(cart.quantity);
            await client.query("UPDATE carts SET quantity = $1 WHERE cart_id = $2", [updateQuantity, cart.cart_id]);
        } else {
            await client.query("INSERT INTO carts (user_id, product_id, quantity) VALUES ($1, $2, $3)", [user_id, product_id, quantity]);
        }
        res.redirect("/cart");
    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
})

app.post("/admin/add-product", ensureAuthenticated, ensureIsAdmin, async (req, res) => {
    const user_id = req.user.user_id;
    const category_id = req.body.category_id;
    const name = req.body.name;
    const desc = req.body.description;
    const stock = req.body.stock;
    const price = req.body.price;

    try {
        const client = await pool.connect();
        await client.query("INSERT INTO products (user_id, category_id, name, description, stock, price) VALUES ($1, $2, $3, $4, $5, $6)", [user_id, category_id, name, desc, stock, price]);

        globalMessage.setMessage("success", "Product created successfully", "Lorem Ipsum");
        res.redirect("/admin");
    } catch (error) {
        console.log(error);
        globalMessage.setMessage("danger", "An error occured", error.message);
        res.redirect("/");
    }
})

app.post("/admin/edit-product", ensureAuthenticated, ensureIsAdmin, async (req, res) => {
    const product_id = req.body.product_id;
    const category_id = req.body.category_id;
    const name = req.body.name;
    const description = req.body.description;
    const stock = req.body.stock;
    const price = req.body.price;

    try {
        const client = await pool.connect();
        await client.query("UPDATE products SET category_id = $1, name = $2, description = $3, stock = $4, price = $5 WHERE product_id = $6", [category_id, name, description, stock, price, product_id]);

        globalMessage.setMessage("success", "Product updated successfully", "Lorem Ipsum");
        res.redirect("/admin");
    } catch (error) {
        console.log(error);
        globalMessage.setMessage("danger", "An error occured", error.message);
        res.redirect("/");
    }
})

app.post("/register", async (req, res) => {
    const email = req.body.email;
    const username = req.body.username;
    const password = req.body.password;
    const password_confirmation = req.body.password_confirmation;

    try {
        const client = await pool.connect();
        const checkUnique = await client.query("SELECT * FROM users WHERE email = $1", [email]);

        if (checkUnique.rowCount > 0) {
            globalMessage.setMessage("danger", "Email already exist", "Try using a different email");
            res.redirect("/register");
        } else {
            if (password !== password_confirmation) {
                globalMessage.setMessage("danger", "Password doesn't match", "Make sure the password confirmation matches the password");
                res.redirect("/register");
            } else {
                bcrypt.hash(password, saltRounds, async (err, hash) => {
                    if (err) {
                        console.log(err);
                    } else {
                        const result = await client.query("INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *", [username, email, hash]);
                        const user = result.rows[0];

                        req.login(user, (err) => {
                            console.log(err);
                            globalMessage.setMessage("success", "Account created successfully", "You can add items to cart now");
                            res.redirect("/");
                        })
                    }
                })
            }
        }
    } catch (error) {
        console.log(error);
    }
})

app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login"
}));

passport.use(
    "local",
    new Strategy(
        { usernameField: "email" }, // Specify which field is used as the username
        async (email, password, done) => {
            try {
                const client = await pool.connect();
                const result = await client.query("SELECT * FROM users WHERE email = $1", [email]);
                if (result.rowCount === 0) {
                    globalMessage.setMessage("danger", "Email doesn't exist", "Please make sure you entered the correct email");
                    return done(null, false);
                }

                const user = result.rows[0];
                const storedHashPassword = user.password_hash;

                bcrypt.compare(password, storedHashPassword, (err, isMatch) => {
                    if (err) {
                        return done(err);
                    } else if (isMatch) {
                        console.log(user);
                        globalMessage.setMessage("success", "Account logged in successfully", "Welcome back")
                        return done(null, user);
                    } else {
                        globalMessage.setMessage("danger", "Incorrect password", "Please make sure you entered the correct password");
                        return done(null, false);
                    }
                });
            } catch (error) {
                return done(error);
            }
        }
    )
);

passport.serializeUser((user, cb) => {
    cb(null, user);
})

passport.deserializeUser((user, cb) => {
    cb(null, user);
})

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
})