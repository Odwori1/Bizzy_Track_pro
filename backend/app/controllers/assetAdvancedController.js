const assetAdvancedController = {
    advancedSearch: (req, res) => {
        res.json({ success: true, data: [] });
    },
    getAnalytics: (req, res) => {
        res.json({ success: true, data: {} });
    },
    getDepreciationSchedule: (req, res) => {
        res.json({ success: true, data: [] });
    }
};
export { assetAdvancedController };
