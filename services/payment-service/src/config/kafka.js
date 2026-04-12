const { Kafka, Partitioners } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'payment-service',
    brokers: [(process.env.KAFKA_BOOTSTRAP_SERVERS || '127.0.0.1:9092')],
    retry: {
         initialRetryTime: 300,
         retries: 5
    }
});

const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner
});

const consumer = kafka.consumer({ groupId: 'payment-group' });

const connectKafka = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            await producer.connect();
            await consumer.connect();
            console.log('✅ Kafka Producer & Consumer connected successfully');
            return; // Thành công → thoát
        } catch (error) {
            console.error(`❌ Failed to connect to Kafka. Retries left: ${retries - 1}. Error: ${error.message}`);
            retries -= 1;
            if (retries === 0) {
                throw new Error(`Cannot connect to Kafka after 5 attempts: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
};

module.exports = { kafka, producer, consumer, connectKafka };
