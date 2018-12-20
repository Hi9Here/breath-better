const {
  dialogflow,
  SignIn,
  Suggestions,
  List,
  Image,
  SimpleResponse
} = require('actions-on-google');
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const util = require('util')

const serviceAccount = require("./config/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://breath-better.firebaseio.com"
});

const auth = admin.auth();
const db = admin.firestore();
const dbuser = {
  user: db.collection('user'),
};
// Just something to stop annoying error messages, ignore
db.settings({ timestampsInSnapshots: true });

const version = 0.25

const datetime = Date.now()
const datetimeString = datetime.toString()

console.log(`version is ${version}`)
console.log(`deploy datetime is ${datetimeString}`)

const app = dialogflow({
  // It's in the Firebase configuration files
  clientId: functions.config().fireconfig.key,
  debug: true,
});

// Middleware get's fired everytime before intents
app.middleware(async(conv) => {
  // Get the email value from the Conversation User
  const { email } = conv.user;
  console.log('Middleware conv.user object ' + util.inspect(conv.user));
  console.log('Middleware conv.data object ' + util.inspect(conv.data));
  console.log('Middleware email ' + util.inspect(email));
  console.log('Payload ' + util.inspect(conv.user.profile.payload));
  console.log(`Fireconfig is ${functions.config().fireconfig.key}`)
  if (!conv.data.uid && email) {
    try {
      // If there is no uid then grab the UID from the Firebase Email Address
      conv.data.uid = (await auth.getUserByEmail(email)).uid;
    } catch (e) {
      if (e.code !== 'auth/user-not-found') {
        throw e;
      }
      // If the user is not found, create a new Firebase auth user
      // using the email obtained from the Google Assistant
      conv.data.uid = (await auth.createUser({ email })).uid;
    }
  }
  if (conv.data.uid) {
    console.log(`Middleware dbuser.user.doc(conv.data.uid)  ${JSON.stringify(dbuser.user.doc(conv.data.uid))}`);
    console.log('Middleware conv.user.ref ' + (conv.user.ref));
    conv.user.ref = dbuser.user.doc(conv.data.uid);
  }
});

app.intent('Default Welcome Intent', async(conv) => {
  const { payload } = conv.user.profile;
  const name = payload ? ` ${payload.given_name}` : '';
  conv.ask(`Hi ${name}! `);

  // Suggestions will be placed at the end of the response
  conv.ask(new Suggestions('Yes', 'Nop'));

  if (conv.user.ref) {
    const doc = await conv.user.ref.get();
    if (doc.exists) {
      const visits = doc.data().Visits;
      // 
      console.log('Default Welcome Intent conv.user.ref' + (conv.user.ref));
      // Results as Object object
      console.log('Default Welcome Intent doc.data() ' + util.inspect(doc.data()))
        // Undefined
      console.log(`Default Welcome Intent doc.data.Visits is ${doc.data.Visits}`);
      // Works
      const { level, Visits, FirstName } = doc.data();
      // TODO Testing Version
      return conv.ask(` Version ${version} You have this amount of visits ${visits}.`);
    }
  }
  if (conv.user.ref) {
    const doc = await conv.user.ref.get();
    if (doc.exists) {
      const visits = doc.data().Visits;
      // 
      console.log('Default Welcome Intent conv.user.ref' + (conv.user.ref));
      // Results as Object object
      console.log('Default Welcome Intent doc.data() ' + util.inspect(doc.data()))
        // Undefined
      console.log(`Default Welcome Intent doc.data.Visits is ${doc.data.Visits}`);
      // Works
      // TODO Testing Version
      return conv.ask(` Version ${version} You have this amount of visits ${visits}.`);
    }
  } else {
    await conv.user.ref.set({
      level: account,
      Email: payload.email,
      LastName: payload.family_name,
      FirstName: payload.given_name,
      FullName: payload.name,
      ProfileImage: payload.picture,
      ProfileCreated: payload.iat,
      ProfileExpires: payload.exp,
      GoogleID: payload.sub,
      Visits: 0
    });
    conv.SimpleResponse(`I've just added the profile info to the database`);
    return
  }
  conv.ask(`We don't have any of your profile info to add to database`);
});

app.intent('Give Account', async(conv, { account }) => {
  const { payload } = conv.user.profile
    // conv.data.level = account;
  console.log('Give Account conv.user.ref is' + util.inspect(conv.user.ref));
  if (conv.user.ref) {
    await conv.user.ref.set({
      level: account,
      Email: payload.email,
      LastName: payload.family_name,
      FirstName: payload.given_name,
      FullName: payload.name,
      ProfileImage: payload.picture,
      ProfileCreated: payload.iat,
      ProfileExpires: payload.exp,
      GoogleID: payload.sub,
      Visits: 0
    });
    conv.ask(`I got ${account} as your Account Access ${payload.given_name} .`);
    return conv.ask(` Since you are signed in, I'll remember it next time.`);
  }
  // Sign In should happen later in the conversation and not in welcome intent
  // See `Action discovery` docs: `Don't block your flow with account linking`
  // https://developers.google.com/actions/discovery/implicit#action_discovery
  conv.ask(new SignIn(`To save ${account} as your Account Access for next time`));
});

app.intent('Get Sign In', async(conv, params, signin) => {
  if (signin.status !== 'OK') {
    return conv.close(`Let's try again next time.`);
  }
  const account = conv.data.level;
  console.log(`Get Sign In account is ${account}`);
  console.log(`Get Sign in conv.data is ${conv.data}`);
  await conv.user.ref.set({
    level: account
  });
  conv.ask(`I saved ${account} as your Account Level for next time.`);
});

exports.breath = functions.https.onRequest(app);