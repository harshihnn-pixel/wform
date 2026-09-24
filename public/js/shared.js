/* shared.js — rules used by both the browser and the Node.js server:
   form fields, statuses, required documents, completion % and EMI maths. */
(function (root) {
  "use strict";
  var STATUS = {
    draft: ["Incomplete", "warn"], submitted: ["Submitted", "info"], with_bank: ["With bank", "info"],
    sanctioned: ["Sanctioned", "good"], disbursed: ["Disbursed", "good"], rejected: ["Rejected", "bad"], withdrawn: ["Withdrawn", "neutral"]
  };
  var COMPLETED = ["submitted", "with_bank", "sanctioned", "disbursed", "rejected", "withdrawn"];
  var TRACK = ["submitted", "with_bank", "sanctioned", "disbursed"];      // progress after submission
  var LOAN_TYPES = ["Home Loan", "Plot Loan", "Construction Loan", "Loan Against Property", "Personal Loan", "Vehicle Loan", "Business Loan", "Education Loan", "Other"];
  var EMP_TYPES = ["Salaried", "Self-employed / Business", "Professional (Doctor, CA, etc.)", "NRI", "Not currently employed"];
  var PROPERTY_LOANS = ["Home Loan", "Plot Loan", "Construction Loan", "Loan Against Property"];
  var DOC_TYPES = {
    pan: "PAN card", aadhaar: "Aadhaar card", photo: "Passport photo", salary_slip: "Salary slips (last 3 months)",
    bank_statement: "Bank statement (last 6 months)", form16: "Form 16", itr: "ITR (last 2 years)", property_documents: "Property documents"
  };
  var MAX_UPLOAD = 5 * 1024 * 1024;

  /* The form: 6 steps. Each field: [key, label, type, required, hint, full-width]
     type is "text" | "number" | "date" | "tel" | "email" | "textarea" | an array of options */
  var STEPS = [
    { id: "personal", title: "Personal details", intro: "As printed on the PAN card.", fields: [
      ["name", "Full name", "text", 1], ["dob", "Date of birth", "date", 1],
      ["gender", "Gender", ["Male", "Female", "Other"]], ["marital", "Marital status", ["Single", "Married", "Other"]],
      ["phone", "Mobile number", "tel", 1], ["email", "Email", "email"],
      ["pan", "PAN number", "text", 1, "Format: ABCDE1234F"], ["aadhaarLast4", "Aadhaar (last 4 digits)", "text", 0, "Only the last 4 digits are stored"]] },
    { id: "address", title: "Address", intro: "Where the applicant lives now.", fields: [
      ["address", "House / street / area", "textarea", 1, "", 1], ["city", "City", "text", 1], ["state", "State", "text", 1],
      ["pincode", "PIN code", "text", 1], ["residence", "Residence type", ["Owned", "Rented", "Family owned", "Company provided", "PG / hostel"]],
      ["yearsAtAddress", "Years at this address", "number"]] },
    { id: "work", title: "Work & income", intro: "Banks look at income, employer type and job stability first.", fields: [
      ["empType", "Employment type", EMP_TYPES, 1], ["employer", "Employer / business name", "text", 1],
      ["designation", "Designation", "text"], ["experience", "Total work experience (years)", "number", 1],
      ["income", "Net monthly income (₹)", "number", 1], ["otherIncome", "Other monthly income (₹)", "number"],
      ["companyType", "Employer type", [["listed", "Listed company"], ["unlisted", "Non-listed / private limited"], ["government", "Government / PSU"], ["proprietorship", "Proprietorship"], ["partnership", "Partnership firm"]], 0, "Banks check this first"],
      ["payroll", "Payroll type", [["permanent", "Permanent (company payroll)"], ["contract", "Contract"], ["third_party", "Third-party / manpower agency"], ["self_employed", "Self-employed"]]],
      ["industry", "Industry", [["it", "IT / software"], ["banking", "Banking"], ["manufacturing", "Manufacturing"], ["government", "Government"], ["bpo", "BPO / call centre"], ["pharma", "Pharma"], ["nbfc", "NBFC / finance company"], ["insurance", "Insurance"], ["real_estate", "Real estate"], ["other", "Other"]]]] },
    { id: "loan", title: "Loan & credit", intro: "How much is needed, and your credit history. These answers decide which banks can consider you.", fields: [
      ["loanType", "Loan type", LOAN_TYPES, 1], ["amount", "Loan amount (₹)", "number", 1],
      ["tenure", "Tenure (years)", "number", 1], ["purpose", "Purpose", "text"],
      ["existingEmi", "Existing EMIs per month (₹)", "number", 0, "All current loans and credit cards"], ["cibil", "CIBIL score (if known)", "number", 0, "300 to 900"],
      ["enquiries", "Loan enquiries in the last 3 months", "number", 0, "How many times lenders checked your CIBIL"], ["bounces", "EMI bounces in the last 12 months", "number"],
      ["settled", "Any loan or card settled with a lender?", [["none", "No"], ["cleared", "Yes, but now closed"], ["open", "Yes, still showing"]]],
      ["propertyValue", "Property value (₹)", "number", 0, "Only for home, plot, construction or property loans"], ["coApplicant", "Co-applicant name (optional)", "text"]] },
    { id: "documents", title: "Documents", intro: "PDF, JPG or PNG, up to 5 MB each. You can also add them later.", fields: [] },
    { id: "review", title: "Review & submit", intro: "", fields: [] }
  ];

  function val(v) { return v == null ? "" : String(v).trim(); }
  function ageFrom(dob) {
    var d = new Date(dob); if (!dob || isNaN(d)) return null;
    var t = new Date(), a = t.getFullYear() - d.getFullYear();
    if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
    return a;
  }
  /* Returns an error message, or "" when the value is fine. */
  var CHECK = {
    name: function (v) { return v.length >= 2 ? "" : "Enter the full name."; },
    dob: function (v) { var a = ageFrom(v); return a != null && a >= 18 && a <= 75 ? "" : "Applicant must be 18 to 75 years old."; },
    phone: function (v) { return /^[6-9]\d{9}$/.test(v) ? "" : "Enter a 10-digit mobile number starting with 6–9."; },
    email: function (v) { return !v || /^\S+@\S+\.\S+$/.test(v) ? "" : "Enter a valid email address."; },
    pan: function (v) { return /^[A-Z]{5}\d{4}[A-Z]$/i.test(v) ? "" : "PAN looks like ABCDE1234F."; },
    aadhaarLast4: function (v) { return !v || /^\d{4}$/.test(v) ? "" : "Enter exactly 4 digits."; },
    pincode: function (v) { return /^\d{6}$/.test(v) ? "" : "PIN code has 6 digits."; },
    experience: function (v) { return v !== "" && +v >= 0 && +v <= 50 ? "" : "Enter experience in years."; },
    income: function (v) { return +v > 0 ? "" : "Enter the monthly income."; },
    amount: function (v) { return +v >= 10000 ? "" : "Enter at least ₹10,000."; },
    tenure: function (v) { return +v >= 1 && +v <= 30 ? "" : "Tenure is 1 to 30 years."; },
    cibil: function (v) { return !v || (+v >= 300 && +v <= 900) ? "" : "CIBIL is between 300 and 900."; },
    enquiries: function (v) { return v === "" || (+v >= 0 && +v <= 99) ? "" : "Enter a number."; },
    bounces: function (v) { return v === "" || (+v >= 0 && +v <= 99) ? "" : "Enter a number."; }
  };
  function fieldError(f, value) {
    var v = val(value);
    if (f[3] && v === "") return "Required.";
    if (v === "") return "";
    return CHECK[f[0]] ? CHECK[f[0]](v) : "";
  }
  /* Missing or invalid fields across the form steps, for the review screen and the server. */
  function problems(app) {
    var out = [];
    STEPS.forEach(function (s) {
      s.fields.forEach(function (f) {
        var e = fieldError(f, ((app.data || {})[s.id] || {})[f[0]]);
        if (e) out.push({ step: s.id, key: f[0], label: f[1], msg: e });
      });
    });
    return out;
  }
  function requiredDocs(app) {
    var d = app.data || {}, et = (d.work || {}).empType, lt = (d.loan || {}).loanType;
    var r = ["pan", "aadhaar", "photo", "bank_statement"];
    if (et === "Salaried") r.push("salary_slip", "form16");
    else if (et && et !== "Not currently employed") r.push("itr");
    if (PROPERTY_LOANS.indexOf(lt) >= 0) r.push("property_documents");
    return r;
  }
  /* How complete an application is: required fields filled correctly + required documents uploaded. */
  function completion(app) {
    var total = 0, done = 0;
    STEPS.forEach(function (s) {
      s.fields.forEach(function (f) {
        if (!f[3]) return;
        total++;
        if (!fieldError(f, ((app.data || {})[s.id] || {})[f[0]])) done++;
      });
    });
    var docs = requiredDocs(app);
    total += docs.length;
    docs.forEach(function (t) { if ((app.documents || {})[t]) done++; });
    return total ? Math.round(done / total * 100) : 0;
  }
  function emi(p, rate, months) {
    p = Number(p); months = Number(months);
    if (!(p > 0) || !(months > 0)) return 0;
    var r = rate / 1200;
    if (!(r > 0)) return p / months;
    var f = Math.pow(1 + r, months);
    return p * r * f / (f - 1);
  }
  function principalFor(e, rate, months) {
    if (!(e > 0) || !(months > 0)) return 0;
    var r = rate / 1200;
    if (!(r > 0)) return e * months;
    var f = Math.pow(1 + r, months);
    return e * (f - 1) / (r * f);
  }

  var api = { STATUS: STATUS, COMPLETED: COMPLETED, TRACK: TRACK, LOAN_TYPES: LOAN_TYPES, EMP_TYPES: EMP_TYPES, PROPERTY_LOANS: PROPERTY_LOANS,
    DOC_TYPES: DOC_TYPES, MAX_UPLOAD: MAX_UPLOAD, STEPS: STEPS, fieldError: fieldError, problems: problems, requiredDocs: requiredDocs,
    completion: completion, ageFrom: ageFrom, emi: emi, principalFor: principalFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Shared = api;
})(this);
