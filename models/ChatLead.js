const mongoose = require("mongoose");

const ChatLeadSchema = new mongoose.Schema(
  {
    name: String,
    mobile: String,
    interest: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ChatLead", ChatLeadSchema);