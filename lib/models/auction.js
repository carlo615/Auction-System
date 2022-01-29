// env
if (!process.env.POSTGRES_CONNECTION) {
  console.log("POSTGRES_CONNECTION environment variable required.");
  process.exit(1);
}

var pg = require('pg');
var moment = require('moment');

/**
 * Helper function to get db connection from the pool.
 *
 * @method     connect
 * @param      {Function}  fn      Callback.
 */
function connect(fn) {
  pg.connect(process.env.POSTGRES_CONNECTION, function(err, client, done) {
    if (err) return fn(err);
    fn(null, client);
    done();
  });
}

/**
 * Converts Date object to UTC ISO string.
 *
 * @method     dateToUtcIsoString
 * @param      {Date}    date    Local date.
 * @return     {string}  Date ISO string.
 */
function dateToUtcIsoString(date) {
  var utcMoment = moment.utc(date).add(moment().utcOffset(), 'm');
  return utcMoment.toISOString();
}

/**
 * Converts auction dates to UTC ISO strings.
 *
 * @method     normalizeDates
 * @param      {Auction}  auction  Auction.
 */
function normalizeDates(auction) {
  if (auction.created) {
    auction.created = dateToUtcIsoString(auction.created);
  }
  if (auction.start_time) {
    auction.start_time = dateToUtcIsoString(auction.start_time);
  }
  if (auction.end_time) {
    auction.end_time = dateToUtcIsoString(auction.end_time);
  }
  return auction;
}

/**
 * Auction.
 *
 * @class
 * @param      {Object}  obj     Object to copy properties from.
 */
function Auction(obj) {
  var key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      this[key] = obj[key];
    }
  }
}

/**
 * Saves auction in db.
 *
 * @method     save
 * @param      {Function}  fn      Callback.
 */
Auction.prototype.save = function (fn) {
  if (this.id) {
    this.update(fn);
  } else {
    var auction = this;
    connect(function (err, db) {
      if (err) return fn(err);

      var now = moment().toISOString();
      db.query(
        'INSERT INTO auctions (created, seller, seller_name, item, quantity, min_bid) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created', 
        [now, auction.seller, auction.seller_name, auction.item, auction.quantity, auction.min_bid],
        function (err, result) {
          if (err) return fn(err);

          auction.id = result.rows[0].id;
          auction.created = result.rows[0].created;
          auction.start_time = null;
          auction.end_time = null;
          auction.bid = null;
          auction.winner = null;
          auction.winner_name = null;
          auction.done = false;

          normalizeDates(auction);

          fn();
        });
    });
  }
};

/**
 * Updates auction in db.
 *
 * @method     update
 * @param      {Function}  fn      Callback.
 */
Auction.prototype.update = function (fn) {
  var auction = this;
  connect(function (err, db) {
    if (err) return fn(err);
    db.query(
      'UPDATE auctions SET start_time = $1, end_time = $2, bid = $3, winner = $4, winner_name = $5, done = $6 WHERE id = $7',
      [auction.start_time, auction.end_time, auction.bid, auction.winner, auction.winner_name, auction.done, auction.id],
      fn);
  });
};

/**
 * Deletes auction from db permanently.
 *
 * @method     delete
 * @param      {Function}  fn      Callback.
 */
Auction.prototype.delete = function (fn) {
  var auction = this;
  connect(function (err, db) {
    if (err) return fn(err);
    db.query('DELETE FROM auctions WHERE id = $1', [auction.id], fn);
  });
};

/**
 * Gets auction by id.
 *
 * @method     get
 * @param      {Number}    id      Inventory item id.
 * @param      {Function}  fn      Callback.
 */
Auction.get = function (id, fn) {
  connect(function (err, db) {
    if (err) return fn(err);
    db.query(
      'SELECT id, created, start_time, end_time, seller, seller_name, item, quantity, min_bid, bid, winner, winner_name, done FROM auctions WHERE id = $1', 
      [id], 
      function (err, result) {
        if (err) return fn(err);
        if (!result.rows.length) return fn();

        var auction = normalizeDates(new Auction(result.rows[0]));
        fn(null, auction);
      });
  });
};

/**
 * Gets current auction.
 *
 * @method     get
 * @param      {Function}  fn      Callback.
 */
Auction.getCurrent = function (fn) {
  connect(function (err, db) {
    if (err) return fn(err);

    var now = moment().toISOString();
    db.query(
      'SELECT id, created, start_time, end_time, seller, seller_name, item, quantity, min_bid, bid, winner, winner_name, done FROM auctions WHERE end_time >= $1 LIMIT 1', 
      [now], 
      function (err, result) {
        if (err) return fn(err);
        if (!result.rows.length) return fn();
        
        var auction = normalizeDates(new Auction(result.rows[0]));
        fn(null, auction);
      });
  });
};

/**
 * Gets latest completed auction.
 *
 * @method     get
 * @param      {Function}  fn      Callback.
 */
Auction.getLatest = function (fn) {
  connect(function (err, db) {
    if (err) return fn(err);

    var now = moment().toISOString();
    db.query(
      'SELECT id, created, start_time, end_time, seller, seller_name, item, quantity, min_bid, bid, winner, winner_name, done FROM auctions WHERE end_time IS NOT NULL AND end_time < $1 ORDER BY end_time DESC LIMIT 1', 
      [now], 
      function (err, result) {
        if (err) return fn(err);
        if (!result.rows.length) return fn();

        var auction = normalizeDates(new Auction(result.rows[0]));
        fn(null, auction);
      });
  });
};

/**
 * Gets next auction.
 *
 * @method     get
 * @param      {Function}  fn      Callback.
 */
Auction.getNext = function (fn) {
  connect(function (err, db) {
    if (err) return fn(err);

    db.query(
      'SELECT id, created, start_time, end_time, seller, seller_name, item, quantity, min_bid, bid, winner, winner_name, done FROM auctions WHERE start_time IS NULL ORDER BY created ASC LIMIT 1', 
      [], 
      function (err, result) {
        if (err) return fn(err);
        if (!result.rows.length) return fn();

        var auction = new Auction(result.rows[0]);
        fn(null, normalizeDates(auction));
      });
  });
};

module.exports = Auction;