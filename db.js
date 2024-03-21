const Pool = require('pg').Pool
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || '192.168.3.206',
  database: process.env.PG_DATABASE || 'magic8',
  password: process.env.PG_PASSWORD || '',
  port: process.env.PG_PORT || 54151,
});

const addItemForSlackUser = (slackId, message, itemType, deliveryType, imageSlackId) => {

  return new Promise((resolve, reject) => {
    pool.query(
      "INSERT INTO magic.items(" +
      "item_type, source_text, employee_id, date_created, delivery_type, slack_image_id) " +
      "VALUES ($1, $2, $3, now(), $4, $5) RETURNING item_id;", [
      itemType,
      message,
      slackId,
      deliveryType,
      imageSlackId
    ], (error, results) => {
      if (error) {
        reject(error);
      }
      resolve(results);
    });
  });
};

//
const getRandomItem = () => {
  return new Promise((resolve, reject) => {
    pool.query(
      "SELECT item_id, item_type, source_text, slack_image_id FROM magic.items " +
      "WHERE delivery_type = 1 AND date_used IS NULL " +
      "ORDER BY random() LIMIT 1 ",
      (error, results) => {
        if (error) {
          reject(error);
        }
        resolve(results.rows[0]);
      });
  });
};

const getGeneralItem = () => {
  return new Promise((resolve, reject) => {
    pool.query(
      "SELECT item_id, item_type, source_text FROM magic.items " +
      "WHERE delivery_type = 2 AND date_used IS NULL " +
      "ORDER BY random() LIMIT 1 ",
      (error, results) => {
        if (error) {
          reject(error);
        }
        resolve(results.rows[0]);
      });
  });
};


const markItemAsUsed = (itemId) => {
  return new Promise((resolve, reject) => {
    pool.query(
      "UPDATE magic.items " +
      "SET date_used = now() " +
      "WHERE item_id = $1", [
      itemId
    ], (error, results) => {
      if (error) {
        reject(error);
      }
      resolve();
    });
  });
};

module.exports = {
  addItemForSlackUser,
  markItemAsUsed,
  getRandomItem,
  getGeneralItem
}