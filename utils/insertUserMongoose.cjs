const mongoose = require('mongoose');

const bcrypt = require('bcrypt');
// Connexion à MongoDB
mongoose.connect('mongodb://localhost:27017/sessions')
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Error connecting to MongoDB:', err));

// Définition d'un schéma
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passkey: { type: String, required: true },
    TornAPIKey: { type: String, required: true },
    type: { type: String, required: true },
    id: { type: Number, required: true }
});

// Création d'un modèle basé sur le schéma
const User = mongoose.model('User', userSchema);

// Exemple de création d'un nouvel utilisateur
const createUser = async () => {
    const newUser = new User({
        username: 'laurent',
        passkey: await bcrypt.hash('password', 10),
        TornAPIKey: 'API_KEY',
        type:'admin',
        id:0
    });

    try {
        await newUser.save();
        console.log('User created successfully');
    } catch (error) {
        console.error('Error creating user:', error);
    }
};

// Exemple de recherche d'un utilisateur
const findUser = async (username) => {
    try {
        const user = await User.findOne({ username });
        console.log('User found:', user);
    } catch (error) {
        console.error('Error finding user:', error);
    }
};

// Appel des fonctions d'exemple
await createUser();
findUser('laurent');
