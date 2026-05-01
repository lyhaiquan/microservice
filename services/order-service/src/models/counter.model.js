const mongoose = require('mongoose');

// Counter atomic — thay cho countDocuments() O(N) khi sinh sequential ID.
// findOneAndUpdate với $inc là atomic ở document-level, không cần transaction.
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
}, { _id: false, versionKey: false });

const Counter = mongoose.model('Counter', counterSchema);

Counter.next = async function (key, session = null) {
    const opts = { upsert: true, new: true };
    if (session) opts.session = session;
    const doc = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        opts
    );
    return doc.seq;
};

module.exports = Counter;
