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
require('dotenv').config()

const serviceAccount = require("config/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://breath-better.firebaseio.com"
});


const auth = admin.auth();
const db = admin.firestore();
// Just something to stop annoying error messages, ignore
db.settings({ timestampsInSnapshots: true });

const version = 0.1

const datetime = Date.now()
const datetimeString = datetime.toString()

console.log(`deploy datetime is ${datetimeString}`)

const dbuser = {
  user: db.collection('user'),
};

const app = dialogflow({
  // TODO Change this to process.env
  clientId: CLIENTIDENV,
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
    console.log('Middleware dbuser.user.doc(conv.data.uid) ' + (dbuser.user.doc(conv.data.uid)));
    console.log('Middleware conv.user.ref ' + (conv.user.ref));
    conv.user.ref = dbuser.user.doc(conv.data.uid);
  }
});

app.intent('Default Welcome Intent', async(conv) => {
  const { payload } = conv.user.profile;
  const name = payload ? ` ${payload.given_name}` : '';
  conv.ask(`Hi ${name}!`);

  // Suggestions will be placed at the end of the response
  conv.ask(new Suggestions('User', 'Admin'));

  if (conv.user.ref) {
    const doc = await conv.user.ref.get();
    if (doc.exists) {
      const account = doc.data().level;
      // 
      console.log('Default Welcome Intent conv.user.ref' + (conv.user.ref));
      // Results as Object object
      console.log('Default Welcome Intent doc.data() ' + util.inspect(doc.data()))
        // Undefined
      console.log(`Default Welcome Intent doc.data.level is ${doc.data.level}`);
      // Works
      const { level, Admin, FirstName } = doc.data();
      console.log(`Default Welcome Intent level,FirstName is ${level} ${FirstName}`);
      // Works
      console.log(`Default Welcome Intent doc.data().level is ${doc.data().level}`);
      // TODO Testing Version
      return conv.ask(`Version ${version} Your Account Level is ${account}. ` +
        'Tell me your new Account Level.');
    }
  }

  conv.ask(`What's your Account Level?`);
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
      GoogleID: payload.sub
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