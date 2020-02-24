// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const Moment = require('moment');
const MomentTZ = require('moment-timezone');
const admin = require('firebase-admin');

function key(arg){
  return {
    "HOSTELS": "HOSTELS",
    "MAIN GATE":"LAB",
    "LABS":"LAB",
    "ODF":"ODF",
    "SANGAREDDY":"SANGAREDDY",
    "LINGAMPALLY":"LINGAMPALLY",
    "LINGAMPALLYW":"LINGAMPALLYW"
  }[arg.toUpperCase()];
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: '<FIREBASE REALTIME DATABASE URL>',
});

var db = admin.database();

function getFullData(callBackFn) {
  var ref = db.ref('busdata');
  ref.on("value", function(snapshot) {
    callBackFn(snapshot.val());
  }, function (errorObject) {
    console.log("Bus sched read failed: " + errorObject.code);
  });
}

function getFood(mess, day, time, isToday, callbackFn) {
  console.log(mess, day, time);
  var ref = db.ref('messdata');
  ref.on("value", function(snapshot) {
    if(mess == undefined || mess == '') {
      var response =`Here is the menu for ${time} for both for ${isToday ? 'Today' : day}! , UDH is ` + data.UDH[day][time] + ' and LDH is ' + data.LDH[day][time];
      return response;
    }
    var data = snapshot.val();
    var result = data[mess.toUpperCase()][day][time];
    var responses = [
      `Here's the menu for ${time} ${isToday ? 'Today' : day}:`,
      `${isToday ? 'Today' : day}'s ${time} looks tasty:`,
      `The ${result[Math.floor(Math.random() * result.length)]} must be tasty! Here's the menu for ${isToday ? 'Today' : day}:`
    ];
    callbackFn(responses[Math.floor(Math.random() * responses.length)] + result);
  }, function(err) {
    console.log('Mess menu read failed: ' + err.code);
  });
}

function getCurrentFoodTime(currTime) {
  var breakfastStart = Moment('05:00', 'HH:mm').set({date:currTime.date()});
  var breakfastLunch = Moment('10:30', 'HH:mm').set({date:currTime.date()});
  var lunchSnacks = Moment('16:00', 'HH:mm').set({date:currTime.date()});
  var snacksDinner = Moment('18:30', 'HH:mm').set({date:currTime.date()});
  var night = Moment('22:30', 'HH:mm');
  if(currTime > snacksDinner)
    return 'Dinner';
  else if(currTime > lunchSnacks)
    return 'Snacks';
  else if(currTime > breakfastLunch)
    return 'Lunch';
  else if(currTime > breakfastStart)
    return 'Breakfast';
  return '-';
}

function getDataInternal(start, end, currTime, callBackFn) {
  console.log(start, end);
  start = key(start);
  end = key(end);
  var a, b;
  if(start == 'HOSTELS') {
    a = 'FROMIITH';
    b = end;
  }
  else {
    a = 'TOIITH';
    b = start;
  }
  console.log("Checking [", a, "] [", b, "]");
  getFullData(function(data) {
    var times = data[a][b];
    var refTime = Moment(currTime, 'HH:mm');
    var result = [];
    times.forEach(time => {
      var tObj = Moment(time, 'HH:mm').set({date:refTime.date()});
      if(tObj > refTime) result.push(tObj);
    });
    var minTime = Moment(Math.min.apply(null,result));
    callBackFn(minTime);
  });
}

function getData(agent, callBackFn) {
  var time = Moment().add(5, 'hours').add(30, 'minutes');
  var src = agent.parameters.source;
  var dest = agent.parameters.destination;
  console.log(src, dest);
  if(time.day() >= 6) {
    console.log(key(src), key(dest), key('LINGAMPALLY'));
    if(key(dest) == key('LINGAMPALLY'))
      dest = 'LINGAMPALLYW';
    if(key(src) == key('LINGAMPALLY'))
      src = 'LINGAMPALLYW';
  }
  var timeStr = time.format('HH:mm');
  console.log(`Time:${time}`);
  getDataInternal(src, dest, time, callBackFn);
}
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements
 
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
 
  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }
 
  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }
  
  function messMenuHandler(agent) {
    console.log(agent.parameters);
    var mess = agent.parameters.Mess;
    var currTime = Moment().add(5, 'hours').add(30, 'minutes');
    
    var isToday = false;
    var day = agent.parameters.Day;
    if(day == undefined || day == '') day = currTime.format('dddd');
    if(day.toUpperCase() == 'TOMORROW')
      day = Moment().day(currTime.day()+1).format('dddd');
    else if(day.toUpperCase() == 'TODAY')
      day = currTime.format('dddd');
    var foodTime = agent.parameters.FoodTime;
    if(foodTime == '' || foodTime == undefined) {
      foodTime = getCurrentFoodTime(currTime);
    }
    if(foodTime == '-' || foodTime == '')
      agent.add(`You should go to the canteen. It's chilly and beautiful out there.`);
    else
      getFood(mess, day, foodTime, isToday, function(res) {
        agent.add(res);        
      });
  }
  // Uncomment and edit to make your own intent handler
  // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
  // below to get this function to be run when a Dialogflow intent is matched
  function busSchedIntentHandler(agent) {
    var src = agent.parameters.source, dest = agent.parameters.destination;
    if(src == undefined || dest == undefined) agent.add(`I'm sorry. I could not understand!`);
    var result = getData(agent, function(result) {
      if(result.isValid()) {
        var time = result.format('HH:mm');
        var responses = [
          `The next bus from ${src} to ${dest} is at ${time}. Be safe!`,
          `You should leave at ${time} from ${src}. Don't forget your earplugs!`,
          `The bus you are looking for is at ${time}.`
        ];
        agent.add(responses[Math.floor(Math.random() * responses.length)]);
      }
      else
        agent.add(`I'm sorry. I could not find any bus. Please check it on Dashboard!`);

    });
    // agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
    // agent.add(new Card({
    //     title: `Title: this is a card title`,
    //     imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
    //     text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
    //     buttonText: 'This is a button',
    //     buttonUrl: 'https://assistant.google.com/'
    //   })
    // );
    // agent.add(new Suggestion(`Quick Reply`));
    // agent.add(new Suggestion(`Suggestion`));
    // agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
  }

  // Uncomment and edit to make your own Google Assistant intent handler
  // uncomment `intentMap.set('your intent name here', googleAssistantHandler);`
  // below to get this function to be run when a Dialogflow intent is matched
  function googleAssistantHandler(agent) {
    let result = getData(agent);
    console.log("GOOGLE ASSISTANT SAYS HI!", result);
    let conv = agent.conv(); // Get Actions on Google library conv instance
    conv.ask('Hello from the Actions on Google client library!'); // Use Actions on Google library
    agent.add(conv); // Add Actions on Google library responses to your agent's response
  }
  // See https://github.com/dialogflow/fulfillment-actions-library-nodejs
  // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample
  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('BusScheduleIntent', busSchedIntentHandler);
  intentMap.set('MessMenuIntent', messMenuHandler);
  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});
