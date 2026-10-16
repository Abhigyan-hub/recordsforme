const Enquiry = require('../models/Enquiry');

// ==================== PUBLIC FORM HELPERS ====================

const CONTACT_METHODS = ['Phone', 'WhatsApp', 'Email'];
const CONTACT_TIMES = ['Morning', 'Afternoon', 'Evening', 'Anytime'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// A repeat of the same enquiry inside this window is treated as a double submit.
const DOUBLE_SUBMIT_MS = 2 * 60 * 1000;
// Real people take longer than this to fill the form; most bots don't.
const MIN_FILL_MS = 2500;

/** Trimmed string capped at `max` characters, or "" for anything that isn't a string. */
const str = (value, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Short public reference a visitor can quote at reception (admin search matches it). */
const publicReference = (id) => `SS-${String(id).slice(-6).toUpperCase()}`;

function validatePublicEnquiry(body) {
    const errors = {};
    const name = str(body.name, 80);
    if (name.length < 2 || !/\p{L}.*\p{L}/u.test(name)) errors.name = 'Please enter your full name';
    else if (/\d/.test(name)) errors.name = 'Name should not contain numbers';

    const mobileDigits = str(body.mobile, 25).replace(/\D/g, '');
    if (mobileDigits.length < 7 || mobileDigits.length > 15) errors.mobile = 'Please enter a valid mobile number';

    const email = str(body.email, 120).toLowerCase();
    if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address';

    if (!str(body.college, 150)) errors.college = 'Please select your college';
    if (!str(body.enquiryFor, 40)) errors.enquiryFor = 'Please choose what your enquiry is about';

    return { errors, name, email };
}

/** Most recent earlier enquiry from the same mobile number (any formatting) or email. */
async function findPreviousEnquiry(mobile, email) {
    const last10 = mobile.replace(/\D/g, '').slice(-10);
    const or = [];
    if (last10.length >= 7) or.push({ mobile: { $regex: `${last10.split('').join('\\D*')}\\D*$` } });
    if (email) or.push({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!or.length) return null;
    return Enquiry.findOne({ $or: or }).sort({ createdAt: -1 });
}

const addEnquiry = async (req, res) => {
    try {
        const body = req.body || {};

        // ---------- spam checks: pretend success so bots don't adapt ----------
        const elapsed = Number(body._t);
        if (str(body._hp) || (Number.isFinite(elapsed) && elapsed < MIN_FILL_MS)) {
            return res.status(201).json({ success: true, message: 'Enquiry submitted successfully!' });
        }

        const { errors, name, email } = validatePublicEnquiry(body);
        if (Object.keys(errors).length) {
            return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
        }

        const mobile = str(body.mobile, 25);
        const enquiryFor = str(body.enquiryFor, 40);

        // ---------- duplicates: never delete or overwrite, only flag ----------
        const previous = await findPreviousEnquiry(mobile, email);
        const sameMobile = previous && String(previous.mobile).replace(/\D/g, '').slice(-10) === mobile.replace(/\D/g, '').slice(-10);
        if (sameMobile && previous.enquiryFor === enquiryFor && Date.now() - new Date(previous.createdAt).getTime() < DOUBLE_SUBMIT_MS) {
            // Double click / network retry: return the enquiry that was just created.
            return res.status(200).json({
                success: true,
                message: 'Enquiry submitted successfully!',
                repeat: true,
                data: { reference: publicReference(previous._id) },
            });
        }

        // Existing reference handling (Newspaper + "Other" stores the typed newspaper name).
        const reference = str(body.reference, 60);
        const referenceName = str(body.referenceName, 80);
        const referenceNewspaperOther = str(body.referenceNewspaperOther, 80);
        const finalReferenceName =
            reference === 'Newspaper' && referenceName === 'Other' && referenceNewspaperOther
                ? referenceNewspaperOther
                : referenceName;

        const year = Number(body.passingYear);
        const utm = body.utm && typeof body.utm === 'object' ? body.utm : {};

        const newEnquiry = new Enquiry({
            name,
            mobile,
            email,
            college: str(body.college, 150),
            customCollege: str(body.customCollege, 150),
            enquiryFor,
            internshipDuration: str(body.internshipDuration, 40),
            internshipDomain: str(body.internshipDomain, 80),
            courseName: str(body.courseName, 80),
            jobType: str(body.jobType, 40),
            jobCategory: str(body.jobCategory, 80),
            experience: str(body.experience, 40),
            whomToMeet: str(body.whomToMeet, 80),
            reference: reference || null,
            referenceName: finalReferenceName || null,
            referenceOther: str(body.referenceOther, 120) || null,
            referenceNewspaperOther: referenceNewspaperOther || null,

            qualification: str(body.qualification, 80),
            passingYear: Number.isInteger(year) && year >= 1970 && year <= new Date().getFullYear() + 6 ? year : undefined,
            preferredCountry: str(body.preferredCountry, 80),
            message: str(body.message, 1000),
            contactMethod: CONTACT_METHODS.includes(body.contactMethod) ? body.contactMethod : '',
            contactTime: CONTACT_TIMES.includes(body.contactTime) ? body.contactTime : '',
            consentAt: body.consent === true ? new Date() : null,
            utm: {
                source: str(utm.source), medium: str(utm.medium), campaign: str(utm.campaign),
                term: str(utm.term), content: str(utm.content),
            },
            referrer: str(body.referrer, 200),
        });

        await newEnquiry.save();
        console.log(`Enquiry saved ${newEnquiry._id}`);

        if (global.io) {
            global.io.emit("new-enquiry", newEnquiry);
        }

        // Public response: no internal CRM fields or database internals.
        res.status(201).json({
            success: true,
            message: "Enquiry submitted successfully!",
            repeat: !!previous,
            data: { reference: publicReference(newEnquiry._id) },
        });

    } catch (error) {
        console.error("=== Enquiry Save Error ===", error.name, error.message);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: `Please check: ${Object.keys(error.errors).join(', ')}`,
            });
        }
        res.status(500).json({
            success: false,
            message: "We couldn't submit your enquiry right now. Please try again in a moment.",
        });
    }
};

const getEnquiries = async (req, res) => {
    try {
        const enquiries = await Enquiry.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            data: enquiries
        });
    } catch (error) {
        console.error("Error fetching enquiries:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndDelete(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found',
      });
    }

    res.json({
      success: true,
      message: 'Enquiry deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const removeDuplicateEnquiries = async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 });

    const seen = new Set();
    const idsToDelete = [];

    enquiries.forEach((enq) => {
      const date = new Date(enq.createdAt).toISOString().split("T")[0];

      const key = `${enq.mobile}_${date}`;

      if (seen.has(key)) {
        idsToDelete.push(enq._id);
      } else {
        seen.add(key);
      }
    });

    const result = await Enquiry.deleteMany({
      _id: { $in: idsToDelete },
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} duplicate enquiries removed`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
const getDuplicateEnquiries = async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 });

    const groups = {};

    enquiries.forEach((enq) => {
      const date = new Date(enq.createdAt)
        .toISOString()
        .split("T")[0];

      const key = `${enq.mobile}_${date}`;

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(enq);
    });

    const duplicates = Object.values(groups)
      .filter(group => group.length > 1)
      .map(group => ({
        mobile: group[0].mobile,
        date: new Date(group[0].createdAt)
          .toISOString()
          .split("T")[0],
        count: group.length,
        entries: group
      }));

    res.json({
      success: true,
      data: duplicates
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
const deleteDuplicateEnquiries = async (req, res) => {
        try {
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: "Ids required"
            });
            }

            await Enquiry.deleteMany({
            _id: { $in: ids }
            });

            res.json({
            success: true,
            message: `${ids.length} duplicate enquiries deleted`
            });

        } catch (error) {
            res.status(500).json({
            success: false,
            message: error.message
            });
        }
    };

module.exports = { addEnquiry, getEnquiries, deleteEnquiry, removeDuplicateEnquiries, getDuplicateEnquiries, deleteDuplicateEnquiries };