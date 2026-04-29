const { Kafka, logLevel } = require('kafkajs');

const KAFKA_BROKERS = (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(',');
const CLIENT_ID = 'product-service';
const GROUP_ID = 'product-group';

const kafka = new Kafka({
    clientId: CLIENT_ID,
    brokers: KAFKA_BROKERS,
    logLevel: (logLevel && logLevel.INFO) || 4,
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
            console.log('✅ [Product] Kafka Producer & Consumer connected');
            return;
        } catch (err) {
            retries--;
            console.error(`❌ [Product] Kafka connection failed. Retries left: ${retries}. Error: ${err.message}`);
            if (retries === 0) throw new Error(`Cannot connect to Kafka after 5 attempts: ${err.message}`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

module.exports = { producer, consumer, connectKafka };
