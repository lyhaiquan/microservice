const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
    }
});

describe('Auth Service - Register and Login APIs', () => {
    const mockUser = {
        name: 'Test User',
        email: 'testuser@example.com',
        password: 'password123'
    };

    describe('POST /api/auth/register', () => {
        it('should register a new user successfully', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send(mockUser);
            
            if (response.status !== 201) {
                require('fs').writeFileSync('error.log', JSON.stringify(response.body));
            }
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message', 'User registered successfully');
            expect(response.body).toHaveProperty('token');
            expect(response.body.user).toHaveProperty('email', mockUser.email);
            expect(response.body.user).toHaveProperty('name', mockUser.name);
            expect(response.body.user).toHaveProperty('id');
            expect(response.body.user).toHaveProperty('role', 'user');
        });

        it('should fail if email is already in use', async () => {
            await request(app).post('/api/auth/register').send(mockUser);
            const response = await request(app)
                .post('/api/auth/register')
                .send(mockUser);
            
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'User already exists');
        });

        it('should fail if required fields are missing', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({ email: 'test@example.com' }); // missing password and name
            
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'Missing required fields');
        });
    });

    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            // Register a user before each login test
            await request(app).post('/api/auth/register').send(mockUser);
        });

        it('should login an existing user successfully', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: mockUser.email,
                    password: mockUser.password
                });
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Login successful');
            expect(response.body).toHaveProperty('token');
            expect(response.body.user).toHaveProperty('email', mockUser.email);
        });

        it('should fail with invalid password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: mockUser.email,
                    password: 'wrongpassword'
                });
            
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Invalid credentials');
        });

        it('should fail if user does not exist', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                });
            
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message', 'Invalid credentials');
        });

        it('should fail if required fields are missing', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: mockUser.email }); // missing password
            
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('message', 'Missing email or password');
        });
    });
});
