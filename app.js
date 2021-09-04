const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "./eBooks.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DBError: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateJWTToken = async (request, response, next) => {
  let jwtToken = null;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT token");
  } else {
    jwt.verify(jwtToken, "secret_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const { username } = payload;

        let userId = await db.get(
          `SELECT id FROM user WHERE username = '${username}'`
        );
        userId = userId.id;

        let cartId = await db.get(
          `SELECT id FROM cart WHERE user_id = ${userId}`
        );
        cartId = cartId.id;

        request.username = payload.username;
        request.userId = userId;
        request.cartId = cartId;
        next();
      }
    });
  }
};

//LOGIN API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
       SELECT
       *
       FROM
       user
       WHERE
       username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password);
    if (isPasswordCorrect) {
      const payload = {
        username: username,
      };
      const jwtToken = await jwt.sign(payload, "secret_token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  } else {
    response.status(400);
    response.send("Invalid User");
  }
});

//REGISTER USER API
app.post("/users/register/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
        SELECT
        *
        FROM
        user
        WHERE
        username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    const hashedPassword = await bcrypt.hash(password, 10);

    const addUserQuery = `
        INSERT
        INTO
        user(username,password)
        VALUES(
             '${username}', '${hashedPassword}'
        );`;
    await db.run(addUserQuery);

    const userDetails = await db.get(
      `SELECT * FROM user WHERE username = '${username}'`
    );
    const userId = userDetails.id;

    const createUserCartQuery = `
        INSERT INTO 
        cart(user_id, total_price)
        VALUES(${userId} , 0);`;
    await db.run(createUserCartQuery);

    response.send("Successfully Registered :)");
  } else {
    response.status(400);
    response.send("User already exists, try login");
  }
});

//SEE WHO IS LOGIN API
app.get("/user/logged/", authenticateJWTToken, async (request, response) => {
  const { username } = request;
  response.send(username);
});

// GET BOOKS API
app.get("/books/", authenticateJWTToken, async (request, response) => {
  const {
    search_q = "",
    price_range,
    price_filter,
    rating,
    rating_filter,
  } = request.query;

  let getBooksQuery;

  if (
    price_range !== undefined &&
    rating !== undefined &&
    price_filter !== undefined &&
    rating_filter !== undefined
  ) {
    const filterResultsByPrice =
      price_filter === "below"
        ? `price < ${price_range}`
        : `price > ${price_range}`;

    const filterResultsByRating =
      rating_filter === "below" ? `rating < ${rating}` : `rating > ${rating}`;

    getBooksQuery = `
            SELECT
            *
            FROM
            book
            WHERE
            ${filterResultsByPrice} and ${filterResultsByRating} and book_title LIKE '%${search_q}%'`;
  } else if (rating !== undefined && rating_filter !== undefined) {
    const filterResultsByRating =
      rating_filter === "below" ? `rating < ${rating}` : `rating > ${rating}`;
    getBooksQuery = `
            SELECT
            *
            FROM
            book
            WHERE
            ${filterResultsByRating} and book_title LIKE '%${search_q}%'`;
  } else if (price_range !== undefined && price_filter !== undefined) {
    const filterResultsByPrice =
      price_filter === "below"
        ? `price < ${price_range}`
        : `price > ${price_range}`;
    getBooksQuery = `
        SELECT
        *
        FROM
        book
        WHERE
        ${filterResultsByPrice} and book_title LIKE '%${search_q}%'`;
  } else {
    getBooksQuery = `
        SELECT
        *
        FROM
        book
        WHERE
        book_title LIKE '%${search_q}%'`;
  }
  const books = await db.all(getBooksQuery);
  response.send(books);
});

//GET Cart Details API

app.get("/cart/", authenticateJWTToken, async (request, response) => {
  const { username, userId, cartId } = request;

  const getItemsInCartQuery = `
        SELECT
        cart_book.book_id,
        book.book_title,
        cart_book.quantity 
        FROM
        (cart_book INNER JOIN cart ON cart_book.cart_id = cart.id) AS T 
        INNER JOIN book ON book.book_id = T.book_id
        WHERE
        cart_book.cart_id = ${cartId};`;
  const total_price = await db.get(
    `SELECT total_price from cart WHERE id = ${cartId}`
  );

  const cartItems = await db.all(getItemsInCartQuery);

  if (cartItems.length !== 0) {
    response.send({
      items_in_cart: cartItems,
      total_price: "₹ " + total_price.total_price,
    });
  } else {
    response.send("Your Cart Is Empty !!");
  }
});

// ADD BOOKS TO CART API

app.post("/cart/", authenticateJWTToken, async (request, response) => {
  const { username, userId, cartId } = request;
  const { book_id, quantity } = request.body;

  isItemInCart = await db.get(
    `SELECT * FROM cart_book WHERE book_id = ${book_id}`
  );

  if (isItemInCart === undefined) {
    if (quantity < 1) {
      response.status(400);
      response.send("Minimum Quantity Should Be 1 !!");
    } else {
      let bookPrice = await db.get(
        `SELECT price FROM book WHERE book_id = ${book_id}`
      );

      let previousCartPrice = await db.get(
        `SELECT total_price FROM cart WHERE user_id = ${userId}`
      );
      previousCartPrice = previousCartPrice.total_price;

      bookPrice = bookPrice.price;
      const totalPrice = bookPrice * quantity + previousCartPrice;

      const addToCartQuery = `
    INSERT INTO cart_book(cart_id,book_id,quantity) Values(${cartId}, ${book_id}, ${quantity});`;

      await db.run(addToCartQuery);
      await db.run(
        `UPDATE cart SET total_price = ${totalPrice} WHERE id = ${cartId}`
      );
      response.send("Item Added to Cart");
    }
  } else {
    response.status(400);
    response.send("Item Already Present In The Cart, Try Updating Cart");
  }
});

//Update Cart Item API
app.put("/cart/", authenticateJWTToken, async (request, response) => {
  const { username, userId, cartId } = request;
  const { book_id, quantity } = request.body;

  const isItemInCart = await db.get(
    `SELECT * FROM cart_book WHERE book_id = ${book_id}`
  );

  if (isItemInCart !== undefined) {
    if (quantity < 1) {
      response.status(400);
      response.send("Minimum Quantity Should Be 1 !!");
    } else {
      let previousTotalPrice = await db.get(`
        SELECT total_price FROM cart WHERE id = ${cartId}`);
      previousTotalPrice = previousTotalPrice.total_price;

      let previousQuantity = await db.get(
        `SELECT quantity FROM cart_book WHERE book_id = ${book_id}`
      );
      previousQuantity = previousQuantity.quantity;

      let bookPrice = await db.get(
        `SELECT price from book WHERE book_id = ${book_id}`
      );
      bookPrice = bookPrice.price;

      newTotalPrice =
        quantity > previousQuantity
          ? previousTotalPrice + (quantity - previousQuantity) * bookPrice
          : previousTotalPrice - (previousQuantity - quantity) * bookPrice;
      await db.run(
        `UPDATE cart_book SET quantity = ${quantity} WHERE book_id = ${book_id};`
      );
      await db.run(`UPDATE cart SET total_price = ${newTotalPrice}`);
      response.send("Cart Item Updated");
    }
  } else {
    response.status(400);
    response.send("This item is not in the cart !!");
  }
});

// DELETE ITEM FROM CART API

app.delete("/cart/:bookId", authenticateJWTToken, async (request, response) => {
  const { username, userId, cartId } = request;
  const { bookId } = request.params;

  const isItemInCart = await db.get(
    `SELECT * FROM cart_book WHERE book_id = ${bookId}`
  );

  if (isItemInCart !== undefined) {
    let itemQuantity = await db.get(
      `SELECT quantity FROM cart_book WHERE book_id = ${bookId}`
    );
    itemQuantity = itemQuantity.quantity;

    let bookPrice = await db.get(
      `SELECT price from book WHERE book_id = ${bookId}`
    );
    bookPrice = bookPrice.price;

    let previousTotalPrice = await db.get(`
        SELECT total_price FROM cart WHERE id = ${cartId}`);
    previousTotalPrice = previousTotalPrice.total_price;

    const newTotalPrice = previousTotalPrice - bookPrice * itemQuantity;

    const deleteFromCartQuery = `
        DELETE
        FROM
        cart_book
        WHERE
        book_id = ${bookId};`;
    await db.run(deleteFromCartQuery);
    await db.run(`UPDATE cart SET total_price = ${newTotalPrice};`);
    response.send("Item Removed From The Cart.");
  } else {
    response.status(400);
    response.send("This Item Is Not In The Cart !!");
  }
});
