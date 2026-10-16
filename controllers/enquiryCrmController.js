const mongoose = require('mongoose');
const Enquiry = require('../models/Enquiry');

const STATUSES = ['New', 'Contacted', 'In Progress', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const OUTCOMES = ['', 'Converted', 'Not Converted'];

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const notFound = (res) => res.status(404).json({ success: false, message: 'Enquiry not found' });

const fail = (res, error, status = 500) => {
    console.error(error);
    res.status(status).json({ success: false, message: error.message || String(error) });
};

const emitUpdate = (enquiry) => {
    if (global.io) global.io.emit('enquiry-updated', enquiry);
};

// Applies a whitelisted set of CRM updates to a document and records each
// change in the activity log. Returns an error message for invalid input.
const applyUpdates = (enquiry, updates) => {
    const now = new Date();
    const log = (type, message, from = '', to = '') =>
        enquiry.activity.push({ type, message, from, to, at: now });

    let { status, priority, assignedTo, outcome } = updates;

    if (status !== undefined && !STATUSES.includes(status)) return `Invalid status "${status}"`;
    if (priority !== undefined && !PRIORITIES.includes(priority)) return `Invalid priority "${priority}"`;
    if (outcome !== undefined && !OUTCOMES.includes(outcome)) return `Invalid outcome "${outcome}"`;

    // Recording an outcome implies the enquiry is closed.
    if (outcome) status = 'Closed';

    if (status !== undefined && status !== enquiry.status) {
        const from = enquiry.status;
        enquiry.status = status;
        log('status', `Status changed from ${from} to ${status}`, from, status);

        if (from === 'New' && !enquiry.firstContactedAt) enquiry.firstContactedAt = now;
        if (status === 'Closed') {
            enquiry.closedAt = now;
        } else {
            enquiry.closedAt = null;
            if (enquiry.outcome) {
                log('outcome', `Outcome "${enquiry.outcome}" cleared (re-opened)`, enquiry.outcome, '');
                enquiry.outcome = '';
            }
        }
    }

    if (outcome !== undefined && outcome !== enquiry.outcome && enquiry.status === 'Closed') {
        const from = enquiry.outcome;
        enquiry.outcome = outcome;
        log('outcome', outcome ? `Marked as ${outcome}` : 'Outcome cleared', from, outcome);
    }

    if (priority !== undefined && priority !== enquiry.priority) {
        const from = enquiry.priority || 'Medium';
        enquiry.priority = priority;
        log('priority', `Priority changed from ${from} to ${priority}`, from, priority);
    }

    if (assignedTo !== undefined) {
        const next = String(assignedTo).trim();
        if (next !== (enquiry.assignedTo || '')) {
            const from = enquiry.assignedTo || '';
            enquiry.assignedTo = next;
            log('assigned', next ? `Assigned to ${next}` : 'Assignment removed', from, next);
        }
    }

    return null;
};

const getEnquiryById = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return notFound(res);
        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) return notFound(res);
        res.json({ success: true, data: enquiry });
    } catch (error) {
        fail(res, error);
    }
};

const updateEnquiry = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return notFound(res);
        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) return notFound(res);

        const error = applyUpdates(enquiry, req.body || {});
        if (error) return res.status(400).json({ success: false, message: error });

        await enquiry.save();
        emitUpdate(enquiry);
        res.json({ success: true, data: enquiry });
    } catch (error) {
        fail(res, error);
    }
};

const bulkUpdateEnquiries = async (req, res) => {
    try {
        const { ids, updates } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0 || !updates) {
            return res.status(400).json({ success: false, message: 'ids and updates are required' });
        }

        const enquiries = await Enquiry.find({ _id: { $in: ids.filter(isValidId) } });
        for (const enquiry of enquiries) {
            const error = applyUpdates(enquiry, updates);
            if (error) return res.status(400).json({ success: false, message: error });
        }
        await Promise.all(enquiries.map((e) => e.save()));
        enquiries.forEach(emitUpdate);

        res.json({
            success: true,
            message: `${enquiries.length} enquiries updated`,
            data: enquiries
        });
    } catch (error) {
        fail(res, error);
    }
};

const bulkDeleteEnquiries = async (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'ids are required' });
        }
        const result = await Enquiry.deleteMany({ _id: { $in: ids.filter(isValidId) } });
        res.json({
            success: true,
            deletedCount: result.deletedCount,
            message: `${result.deletedCount} enquiries deleted`
        });
    } catch (error) {
        fail(res, error);
    }
};

const addNote = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return notFound(res);
        const text = String(req.body?.text || '').trim();
        if (!text) return res.status(400).json({ success: false, message: 'Note text is required' });

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) return notFound(res);

        enquiry.notes.push({ text, author: req.body?.author || 'Admin' });
        enquiry.activity.push({ type: 'note', message: 'Note added', at: new Date() });

        await enquiry.save();
        emitUpdate(enquiry);
        res.status(201).json({ success: true, data: enquiry });
    } catch (error) {
        fail(res, error);
    }
};

const addFollowUp = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return notFound(res);
        const dueAt = new Date(req.body?.dueAt);
        if (isNaN(dueAt.getTime())) {
            return res.status(400).json({ success: false, message: 'A valid dueAt date is required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) return notFound(res);

        enquiry.followUps.push({ dueAt, note: String(req.body?.note || '').trim() });
        enquiry.activity.push({
            type: 'followup_scheduled',
            message: `Follow-up scheduled for ${dueAt.toISOString()}`,
            to: dueAt.toISOString(),
            at: new Date()
        });

        await enquiry.save();
        emitUpdate(enquiry);
        res.status(201).json({ success: true, data: enquiry });
    } catch (error) {
        fail(res, error);
    }
};

const completeFollowUp = async (req, res) => {
    try {
        const { id, followUpId } = req.params;
        if (!isValidId(id)) return notFound(res);

        const enquiry = await Enquiry.findById(id);
        if (!enquiry) return notFound(res);

        const followUp = enquiry.followUps.id(followUpId);
        if (!followUp) return res.status(404).json({ success: false, message: 'Follow-up not found' });
        if (followUp.completedAt) return res.status(400).json({ success: false, message: 'Follow-up already completed' });

        const now = new Date();
        followUp.completedAt = now;
        followUp.result = String(req.body?.result || '').trim();
        enquiry.activity.push({
            type: 'followup_completed',
            message: followUp.result ? `Follow-up completed: ${followUp.result}` : 'Follow-up completed',
            at: now
        });

        // A completed follow-up counts as contact for a still-new enquiry.
        if (enquiry.status === 'New') applyUpdates(enquiry, { status: 'Contacted' });

        await enquiry.save();
        emitUpdate(enquiry);
        res.json({ success: true, data: enquiry });
    } catch (error) {
        fail(res, error);
    }
};

const deleteFollowUp = async (req, res) => {
    try {
        const { id, followUpId } = req.params;
        if (!isValidId(id)) return notFound(res);

        const enquiry = await Enquiry.findById(id);
        if (!enquiry) return notFound(res);

        const followUp = enquiry.followUps.id(followUpId);
        if (!followUp) return res.status(404).json({ success: false, message: 'Follow-up not found' });

        followUp.deleteOne();
        await enquiry.save();
        emitUpdate(enquiry);
        res.json({ success: true, data: enquiry });
    } catch (error) {
        fail(res, error);
    }
};

module.exports = {
    getEnquiryById,
    updateEnquiry,
    bulkUpdateEnquiries,
    bulkDeleteEnquiries,
    addNote,
    addFollowUp,
    completeFollowUp,
    deleteFollowUp,
};
