require('dotenv').config({ path: __dirname + '/.env' })
const { App } = require("@slack/bolt");
const db = require('./db.js');
const fs = require('fs');

const app = new App({
  token: process.env.BOT_TOKEN,
  signingSecret: process.env.SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: 'debug',
  socketMode: true
});
const random_channel = process.env.RANDOM_CHANNEL;
const general_channel = process.env.GENERAL_CHANNEL;
const ITEM_TYPE = {
  QUESTION: 1,
  MEDIA: 2
};
const DELIVERY_TYPE = {
  RANDOM: 1,
  WEEKLY: 2
};
let holidays = [];


(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running! v.1.0.2');

  const holidaysJson = fs.readFileSync(process.env.HOLIDAYS_JSON);
  holidays = JSON.parse(holidaysJson);

  let now = new Date();

  console.log(process.env.GENERAL_MESSAGE_DAY);
  console.log("isTodayHoliday: ", isTodayHoliday());
  console.log("isTodayGeneralMessageDay: ", now.getDay() === (process.env.GENERAL_MESSAGE_DAY ? process.env.GENERAL_MESSAGE_DAY : 3));


  setupIntervalForMessagingRandom();
  setupIntervalForMessagingGeneral();

})();


app.event('app_home_opened', async ({ event, client, body, context, logger }) => {
  try {
    await refreshHomeViewForUser(false, client, event.user, logger);
    console.log(event);
  }
  catch (error) {
    console.error(error);
    logger.error(error);
  }
});

app.view('view_submitquestion', async ({ ack, body, view, client, logger }) => {
  try {
    await ack();
    const questionText = view['state']['values']["block_question"]["plain_text_input-action"].value;
    const deliveryType = view['state']['values']["block_delivery"]['static_select-action']['selected_option'].value;

    if (questionText && questionText.length > 0 && questionText != "") {
      const itemId = await db.addItemForSlackUser(body.user.id, questionText, ITEM_TYPE.QUESTION, deliveryType == "weekly" ? DELIVERY_TYPE.WEEKLY : DELIVERY_TYPE.RANDOM, null)
      refreshHomeViewForUser(true, client, body.user.id, logger);
    }
  }
  catch (error) {
    console.error(error);
    logger.error(error);
  }

});

app.view('view_submitimage', async ({ ack, body, view, client, logger }) => {
  try {
    await ack();
    const url = view['state']['values']["block_url"]["plain_imgtext_input-action"];
    const img = view['state']['values']["block_file"]["file_input_action_id_1"]["files"][0];

    if (isValidUrl(url.value)) {
      //insert public image URL
      const itemId = await db.addItemForSlackUser(body.user.id, url.value, ITEM_TYPE.MEDIA, DELIVERY_TYPE.RANDOM, null)

      refreshHomeViewForUser(true, client, body.user.id, logger);
    }
    else if (img) {
      //make it public via slack
      const result = await app.client.files.sharedPublicURL({
        file: img.id,
        token: process.env.USER_TOKEN
      });
      //add to db
      console.log(result.file);
      const itemId = await db.addItemForSlackUser(body.user.id, result.file.permalink_public, ITEM_TYPE.MEDIA, DELIVERY_TYPE.RANDOM, img.id)

      await refreshHomeViewForUser(true, client, body.user.id, logger);
    }
    else {
      console.error("no valid image uploaded");
    }
  }
  catch (error) {
    console.error(error);
    logger.error(error);
  }
});

app.action('actionId-question', async ({ ack, action, client, body, logger }) => {
  try {
    await ack();

    const result = await client.views.open({

      trigger_id: body.trigger_id,
      // View payload
      view: {
        type: 'modal',
        // View identifier
        callback_id: 'view_submitquestion',
        title: {
          type: 'plain_text',
          text: 'Submit a question'
        },
        blocks: [
          {
            "type": "input",
            "block_id": 'block_question',
            optional: false,
            "element": {
              "type": "plain_text_input",
              "multiline": true,
              "action_id": "plain_text_input-action"
            },
            "label": {
              "type": "plain_text",
              "text": "Question",
              "emoji": true
            }
          },
          {
            "type": "input",
            "block_id": 'block_delivery',
            optional: false,
            "element": {
              "type": "static_select",
              "action_id": "static_select-action",
              "placeholder": {
                "type": "plain_text",
                "text": "Select Delivery Schedule",
                "emoji": true
              },
              "initial_option": {
                "text": {
                  "type": "plain_text",
                  "text": "Weekly",
                  "emoji": true
                },
                "value": "weekly"
              },
              "options": [
                {
                  "text": {
                    "type": "plain_text",
                    "text": "Random",
                    "emoji": true
                  },
                  "value": "random"
                },
                {
                  "text": {
                    "type": "plain_text",
                    "text": "Weekly",
                    "emoji": true
                  },
                  "value": "weekly"
                }
              ],

            },
            "label": {
              "type": "plain_text",
              "text": "When to deliver",
              "emoji": true
            }
          }
        ],
        submit: {
          type: 'plain_text',
          text: 'Submit'
        }
      },
    });
  }
  catch (error) {
    logger.error(error);
  }
});

app.action('actionId-image', async ({ ack, action, client, body, logger }) => {
  try {
    console.log('ADD ITEM');
    await ack();

    const result = await client.views.open({

      trigger_id: body.trigger_id,
      // View payload
      view: {
        type: 'modal',
        // View identifier
        callback_id: 'view_submitimage',
        title: {
          type: 'plain_text',
          text: 'Submit an image'
        },
        blocks: [
          {
            "dispatch_action": false,
            "type": "input",
            "block_id": "block_url",
            optional: true,
            "element": {
              "type": "plain_text_input",
              "action_id": "plain_imgtext_input-action"
            },
            "label": {
              "type": "plain_text",
              "text": "Paste URL",
              "emoji": true
            }
          },
          {
            "type": "divider"
          },
          {
            "dispatch_action": true,
            "type": "input",
            "block_id": "block_file",
            optional: true,
            "element": {
              "type": "file_input",
              "action_id": "file_input_action_id_1",
              "filetypes": [
                "jpg",
                "png",
                "gif",
                "webp"
              ],
              "max_files": 1
            },
            "label": {
              "type": "plain_text",
              "text": "Upload Image (jpg, png, gif, webp)"
            }
          }
        ],
        submit: {
          type: 'plain_text',
          text: 'Submit'
        }
      },
    });

  }
  catch (error) {
    logger.error(error);
  }
});

async function refreshHomeViewForUser(didSumbit, client, userId, logger) {
  try {
    const result = await client.views.publish({
      user_id: userId,
      view: {
        type: 'home',
        callback_id: 'home_view',
        blocks: getWelcomeBlocksForUser(userId, didSumbit)
      }
    });

  } catch (error) {
    logger.error(error);
    // handle error
  }

}

function getWelcomeBlocksForUser(slackId, didSumbit) {
  const intro = didSumbit ?
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":magic-8-ball: Thanks *<@" + slackId + ">* for submitting something, I'll add it to the list! :magic-8-ball:"
      }
    } :
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":wave: Hey *<@" + slackId + ">*! Add something to the Magic :8-ball: and shake it up!"
      }
    };



  let blocks = [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": didSumbit ? ":magic-8-ball: Thanks *<@" + slackId + ">* for submitting something, I'll add it to the list! :magic-8-ball:" :
          ":wave: Hey *<@" + slackId + ">*! Add something to the Magic :magic-8-ball: and shake it up!"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "rich_text",
      "elements": [
        {
          "type": "rich_text_section",
          "elements": [
            {
              "type": "text",
              "text": "Be sure to keep all questions and images work appropriate.\n"
            }
          ]
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Add Question",
            "emoji": true
          },
          "value": "Add Question",
          "action_id": "actionId-question"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Add GIF / Image",
            "emoji": true
          },
          "value": "click_me_123",
          "action_id": "actionId-image"
        }
      ]
    }
  ];

  return blocks;
}

function isValidUrl(urlString) {
  try {
    return Boolean(new URL(urlString));
  }
  catch (e) {
    return false;
  }
}

function isTodayHolidayOrWeekend() {
  const t = new Date();
  const formatted = t.getFullYear() + "-" + (t.getMonth() + 1 >= 10 ? t.getMonth() + 1 : "0" + (t.getMonth() + 1)) + "-" + (t.getDate() >= 10 ? t.getDate() : "0" + t.getDate());
  return null != holidays.find(m => m.date === formatted) || (t.getDay() == 0 || t.getDay() == 6);
}

function isTodayHoliday() {
  const t = new Date();
  const formatted = t.getFullYear() + "-" + (t.getMonth() + 1 >= 10 ? t.getMonth() + 1 : "0" + (t.getMonth() + 1)) + "-" + (t.getDate() >= 10 ? t.getDate() : "0" + t.getDate());
  return null != holidays.find(m => m.date === formatted);
}

function setupIntervalForMessagingGeneral() {
  const now = new Date();
  let msgTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), process.env.GENERAL_MESSAGE_HOUR || 10, 0, 0, 0);

  if (msgTime - now < 0) { //we're past msg time on server startup so set it up for tomorrow
    msgTime.setDate(msgTime.getDate() + 1);
  }
  console.log('notify general users in: ' + ((((msgTime - now) / 1000) / 60) / 60) + " hours");
  setTimeout(checkToNotifyGeneralUsers, msgTime - now);

}

async function checkToNotifyGeneralUsers() {
  const now = new Date();
  setTimeout(checkToNotifyGeneralUsers, 1000 * 60 * 60 * 24); //call this again in exactly one day from now...

  try {
    if (!isTodayHoliday() && now.getDay() === (process.env.GENERAL_MESSAGE_DAY ? process.env.GENERAL_MESSAGE_DAY : 3)) { //it's not a holiday and it's the requested day for msg the general channel
      const genQuestion = await db.getGeneralItem();
      if (genQuestion) {
        console.log(genQuestion);
        await app.client.chat.postMessage({
          channel: general_channel,
          blocks: [
            {
              "type": "rich_text",
              "elements": [
                {
                  "type": "rich_text_section",
                  "elements": [
                    {
                      "type": "text",
                      "text": "Today's Question: \n",
                      "style": {
                        "bold": true
                      }
                    },
                    {
                      "type": "text",
                      "text": genQuestion.source_text
                    }
                  ]
                }
              ]
            }
          ]
        });

        await db.markItemAsUsed(genQuestion.item_id);
      }
      else {
        console.log("***NO MORE GENERAL QUESTIONS IN DB***");
      }
    }
  }
  catch (e) {
    console.log(e);
  }

}

async function checkToNotifyRandomUsers() {

  const now = new Date();
  setTimeout(checkToNotifyRandomUsers, 1000 * 60 * 60 * 24); //call this again in exactly one day from now...

  try {
    if (!isTodayHolidayOrWeekend()) { //it's not a holiday or weekend
      const randomItem = await db.getRandomItem();

      if (randomItem) {

        switch (randomItem.item_type) {
          case ITEM_TYPE.QUESTION:

            await app.client.chat.postMessage({
              channel: random_channel,
              blocks: [
                {
                  "type": "rich_text",
                  "elements": [
                    {
                      "type": "rich_text_section",
                      "elements": [
                        {
                          "type": "text",
                          "text": "Today's Random Question: \n",
                          "style": {
                            "bold": true
                          }
                        },
                        {
                          "type": "text",
                          "text": randomItem.source_text
                        }
                      ]
                    }
                  ]
                }
              ]
            });
            break;
          case ITEM_TYPE.MEDIA:
          default:
            await app.client.chat.postMessage({
              channel: random_channel,
              text: randomItem.source_text
            });

            if (null != randomItem.slack_image_id && randomItem.slack_image_id != "") {
              console.log('deleting image: ' + randomItem.slack_image_id);
              /*const result = await app.client.files.delete({
                file: randomItem.slack_image_id,
                token: process.env.USER_TOKEN
              });*/
            }
            break;
        }
        await db.markItemAsUsed(randomItem.item_id);
      }
      else {
        console.log("***NO MORE RANDOM ITEMS IN DB***");
      }
    }
  }
  catch (e) {
    console.log(e);
  }

}

function setupIntervalForMessagingRandom() {
  //get current time at server startup...
  const now = new Date();
  let msgTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), process.env.RANDOM_MESSAGE_HOUR || 10, 0, 0, 0);

  if (msgTime - now < 0) { //we're past start & end times on server startup so set it up for tomorrow
    msgTime.setDate(msgTime.getDate() + 1);
  }
  console.log('notify random users in: ' + ((((msgTime - now) / 1000) / 60) / 60) + " hours");
  setTimeout(checkToNotifyRandomUsers, msgTime - now);
}
