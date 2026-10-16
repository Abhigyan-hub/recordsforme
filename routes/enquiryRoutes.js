const express = require('express');
const router = express.Router();
// const { addEnquiry, getEnquiries } = require('../controllers/enquiryControllers');

const {
  addEnquiry,
  getEnquiries,
  deleteEnquiry,
  getDuplicateEnquiries,
  deleteDuplicateEnquiries,
  removeDuplicateEnquiries
} = require('../controllers/enquiryControllers');

const {
  getEnquiryById,
  updateEnquiry,
  bulkUpdateEnquiries,
  bulkDeleteEnquiries,
  addNote,
  addFollowUp,
  completeFollowUp,
  deleteFollowUp,
} = require('../controllers/enquiryCrmController');

// Static paths must be registered before "/:id" or Express matches them as an id
// (previously DELETE /remove-duplicates was swallowed by DELETE /:id).
router.post('/', addEnquiry);
router.get('/', getEnquiries);
router.get("/duplicates", getDuplicateEnquiries);
router.delete("/remove-duplicates", removeDuplicateEnquiries);
router.post("/delete-duplicates", deleteDuplicateEnquiries);
router.patch('/bulk', bulkUpdateEnquiries);
router.post('/bulk-delete', bulkDeleteEnquiries);

router.get('/:id', getEnquiryById);
router.patch('/:id', updateEnquiry);
router.delete('/:id', deleteEnquiry);
router.post('/:id/notes', addNote);
router.post('/:id/follow-ups', addFollowUp);
router.patch('/:id/follow-ups/:followUpId/complete', completeFollowUp);
router.delete('/:id/follow-ups/:followUpId', deleteFollowUp);

module.exports = router;
