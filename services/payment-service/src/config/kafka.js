const { Kafka, logLevel } = require('kafkajs');

const KAFKA_BROKERS = (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(',');
const CLIENT_ID = 'payment-service';
const GROUP_ID = 'payment-group';

const kafka = new Kafka({
    clientId: CLIENT_ID,
    brokers: KAFKA_BROKERS,
    logLevel: logLevel.INFO,
    retry: {
        initialRetryTime: 300,
        retries: 8
    }
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: GROUP_ID });

async function connectKafka() {
    let retries = 5;
    while (retries > 0) {
        try {
            await producer.connect();
            await consumer.connect();
            console.log('✅ Kafka Producer & Consumer connected successfully');
            return;
        } catch (err) {
            retries--;
            console.error(`❌ Kafka connection failed. Retries left: ${retries}. Error: ${err.message}`);
            if (retries === 0) throw new Error(`Cannot connect to Kafka after 5 attempts: ${err.message}`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

module.exports = { producer, consumer, connectKafka };