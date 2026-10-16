const mongoose = require('mongoose');

// ==================== CRM SUB-DOCUMENTS ====================
// All CRM fields below are optional and additive, so enquiries created
// before they existed (and the public form payload) keep working unchanged.

const noteSchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true },
    author: { type: String, default: 'Admin' },
}, { timestamps: true });

const followUpSchema = new mongoose.Schema({
    dueAt: { type: Date, required: true },
    note: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    result: { type: String, default: '' },
}, { timestamps: true });

const activitySchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['status', 'priority', 'assigned', 'outcome', 'note', 'followup_scheduled', 'followup_completed'],
        required: true
    },
    message: { type: String, required: true },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    at: { type: Date, default: Date.now },
}, { _id: true });

const enquirySchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, required: true },
    college: { type: String, required: true },
    customCollege: { type: String },

    enquiryFor: {
        type: String,
        enum: ['Internship', 'Job', 'Course', 'Hiring', 'Certification','Overseas','New Visitor','Offer Letter','Skill Development' ,'Other'],
        required: true
    },

    // Optional fields
    internshipDuration: String,
    internshipDomain: String,
    courseName: String,
    jobType: String,
    jobCategory: String,
    experience: String,
    whomToMeet: String,

    // ==================== REFERENCE FIELDS (Fixed) ====================
    reference: {
        type: String,
        // enum: ['Instagram', 'Facebook', 'Ads', 'Friends', 'Teacher', 'Newspaper', 'Other', null, undefined, '']
        default: "",
    },

    referenceName: {
        type: String,
        default: "",
    },

    referenceOther: {
        type: String,
        default: "",
    },

    referenceNewspaperOther: {
        type: String,
        default: "",
    },

    // ==================== ENQUIRY FORM v2 (all optional) ====================
    qualification: { type: String, default: '', maxlength: 80 },
    passingYear: { type: Number, min: 1970, max: 2100 },
    // Only asked for "Overseas" enquiries.
    preferredCountry: { type: String, default: '', maxlength: 80 },
    message: { type: String, default: '', maxlength: 1000 },
    contactMethod: { type: String, enum: ['', 'Phone', 'WhatsApp', 'Email'], default: '' },
    contactTime: { type: String, enum: ['', 'Morning', 'Afternoon', 'Evening', 'Anytime'], default: '' },
    consentAt: { type: Date, default: null },
    // Marketing attribution captured automatically from the landing URL.
    utm: {
        source: { type: String, maxlength: 120 },
        medium: { type: String, maxlength: 120 },
        campaign: { type: String, maxlength: 120 },
        term: { type: String, maxlength: 120 },
        content: { type: String, maxlength: 120 },
    },
    referrer: { type: String, default: '', maxlength: 200 },

    status: {
        type: String,
        enum: ['New', 'Contacted', 'In Progress', 'Closed'],
        default: 'New'
    },

    // ==================== CRM FIELDS ====================
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    // Staff member handling the enquiry. Empty means "fall back to whomToMeet".
    assignedTo: { type: String, default: '' },
    // Only meaningful once status is "Closed".
    outcome: {
        type: String,
        enum: ['', 'Converted', 'Not Converted'],
        default: ''
    },
    firstContactedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    notes: { type: [noteSchema], default: [] },
    followUps: { type: [followUpSchema], default: [] },
    activity: { type: [activitySchema], default: [] },
}, {
    timestamps: true
});

enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ mobile: 1 });

module.exports = mongoose.model('Enquiry', enquirySchema);
