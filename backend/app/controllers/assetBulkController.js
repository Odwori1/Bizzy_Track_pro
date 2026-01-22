const assetBulkController = {
    bulkImport: (req, res) => {
        res.json({ success: true, message: 'Assets bulk imported' });
    },
    exportAssets: (req, res) => {
        res.json({ success: true, data: [] });
    }
};
export { assetBulkController };
