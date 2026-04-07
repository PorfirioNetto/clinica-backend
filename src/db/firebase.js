import admin from 'firebase-admin'
import 'dotenv/config'
let firebaseApp
export function inicializarFirebase(){if(firebaseApp)return firebaseApp;firebaseApp=admin.initializeApp({credential:admin.credential.cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n')})});console.log('Firebase inicializado');return firebaseApp};export {admin}