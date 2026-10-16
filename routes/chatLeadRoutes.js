const express = require("express");
const router = express.Router();

const {
    saveLead,
    getLeads,
    deleteLead
} = require("../controllers/chatLeadController");

router.post("/", saveLead);
router.get("/", getLeads);
router.delete("/:id", deleteLead);

module.exports = router;