const ChatLead = require("../models/ChatLead");

const saveLead = async (req, res) => {
  // console.log("CHAT LEAD API HIT");
  // console.log(req.body);
  try {
    const { name, mobile, interest } = req.body;

    const lead = await ChatLead.create({
      name,
      mobile,
      interest,
    });

    // console.log("CHAT LEAD SAVED");
    // console.log(lead._id);

    res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    console.error("CHAT LEAD ERROR");
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getLeads = async (req, res) => {
  try {
    const leads = await ChatLead.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: leads,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteLead = async (req, res) => {
    try {

        const { id } = req.params;

        await ChatLead.findByIdAndDelete(id);

        res.json({
            success: true,
            message: "Lead deleted successfully"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

module.exports = {
    saveLead,
    getLeads,
    deleteLead,
};