const axios = require("axios");

// Add delay utility
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class PeppolDirectoryLookup {
  constructor(apiBaseUrl = "https://directory.peppol.eu/search/1.0/json") {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Lookup PEPPOL participant information for a list of company numbers
   * @param {string[]} companyNumbers - Array of company registration numbers to check
   * @param {Object} [options] - Optional configuration
   * @param {number} [options.batchSize=50] - Number of company numbers to check in parallel
   * @returns {Promise<Object>} - Object with registered and unregistered company numbers
   */
  async lookupParticipants(companyNumbers, options = {}) {
    const batchSize = 5;
    const results = {
      registered: [],
      unregistered: [],
    };
    const validDocTypes = [
      "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1",
      "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1",
    ];

    // Validate input
    if (!Array.isArray(companyNumbers) || companyNumbers.length === 0) {
      throw new Error("Input must be a non-empty array of company numbers");
    }

    // Process company numbers in sequentially
    for (const companyNumber of companyNumbers) {
      try {
        console.log(`⌛ Checking company ${companyNumber}...`);

        const response = await axios.get(this.apiBaseUrl, {
          params: {
            q: companyNumber,
          },
          timeout: 10000,
        });

        if (response.data && response.data.matches.length > 0) {
          const matches = response.data.matches;
          for (const match of matches) {
            const compliantMatch = match.docTypes.some((docType) =>
              validDocTypes.includes(docType.value)
            );
            results.registered.push({
              companyNumber,
              compliant: compliantMatch,
            });
          }
        } else {
          results.unregistered.push(companyNumber);
        }
      } catch (error) {
        // Handle rate limiting
        if (error.response && error.response.status === 429) {
          // Wait for retry-after header or default to 5 seconds
          const retryAfter = error.response.headers["retry-after"] || 5;
          console.warn(`Rate limited, waiting ${retryAfter}s before retry...`);
          await delay(retryAfter * 1000);
          // Retry the request
          return this.lookupParticipants([companyNumber], options);
        }

        // Handle 404 errors (company not found)
        if (error.response && error.response.status === 404) {
          results.unregistered.push(companyNumber);
        } else {
          console.warn(
            `Error checking company ${companyNumber}:`,
            error.message
          );
        }
      }
    }

    // Remove duplicates from registered list
    results.registered = results.registered.filter(
      (company, index, self) =>
        index ===
        self.findIndex(
          (t) =>
            t.companyNumber === company.companyNumber &&
            t.compliant === company.compliant
        )
    );

    return results;
  }

  /**
   * Get detailed information about a specific PEPPOL participant
   * @param {string} participantId - Participant identifier
   * @returns {Promise<Object>} - Detailed participant information
   */
  async getParticipantDetails(participantId) {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/participants/${participantId}`
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching participant details:", error.message);
      throw error;
    }
  }
}

// Example usage
async function main() {
  const peppolLookup = new PeppolDirectoryLookup();

  // Example company numbers
  const companyNumbers = [
    "0769377373",
    "0772302320",
    "12345647125",
    "0475.384.429",
    "0438.722.387",
    "BE 0635.581.315",
    "0687.702.977",
    "BE 0407.703.668",
  ];

  try {
    // Cleanup company numbers
    companyNumbers.forEach((companyNumber, index) => {
      companyNumbers[index] = companyNumber.replace(/[^0-9]/g, "");
    });

    const lookupResults = await peppolLookup.lookupParticipants(companyNumbers);

    console.log("✅ Registered Companies:");
    console.dir(lookupResults.registered, { depth: null });
    console.log("❌ Unregistered Companies:", lookupResults.unregistered);
  } catch (error) {
    console.error("Lookup failed:", error);
  }
}

// Uncomment to run
main();

module.exports = PeppolDirectoryLookup;
