'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDepreciationStore } from '@/store/week6/depreciation-store';

export default function DepreciationSchedulePage() {
  const { depreciationRecords, currentAssetValues, isLoading, error, fetchDepreciationRecords, fetchCurrentAssetValues } = useDepreciationStore();
  const [selectedAsset, setSelectedAsset] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('current_year');

  useEffect(() => {
    fetchDepreciationRecords();
    fetchCurrentAssetValues();
  }, [fetchDepreciationRecords, fetchCurrentAssetValues]);

  // Filter records based on selection
  const filteredRecords = depreciationRecords.filter(record => {
    if (selectedAsset === 'all') return true;
    return record.asset_id === selectedAsset;
  });

  // Group records by asset for easier display
  const recordsByAsset = filteredRecords.reduce((acc, record) => {
    if (!acc[record.asset_id]) {
      acc[record.asset_id] = [];
    }
    acc[record.asset_id].push(record);
    return acc;
  }, {} as Record<string, any[]>);

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-64">Loading depreciation schedules...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Depreciation Schedules</h1>
          <p className="text-gray-600">View detailed depreciation schedules for all assets</p>
        </div>
        <Link
          href="/dashboard/management/depreciation"
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
        >
          Back to Summary
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Asset
            </label>
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Assets</option>
              {currentAssetValues.map((asset, index) => (
                <option key={`asset-${asset.asset_id || index}`} value={asset.asset_id}>
                  {asset.asset_name} ({asset.asset_code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="current_year">Current Year</option>
              <option value="last_year">Last Year</option>
              <option value="all_time">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Depreciation</h3>
          <p className="text-2xl font-bold">
            ${filteredRecords.reduce((sum, record) => sum + parseFloat(record.depreciation_amount as any), 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Assets Tracked</h3>
          <p className="text-2xl font-bold">{Object.keys(recordsByAsset).length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Depreciation Periods</h3>
          <p className="text-2xl font-bold">{filteredRecords.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Avg. Depreciation</h3>
          <p className="text-2xl font-bold">
            ${filteredRecords.length > 0 ? 
              (filteredRecords.reduce((sum, record) => sum + parseFloat(record.depreciation_amount as any), 0) / filteredRecords.length).toFixed(2) 
              : '0.00'}
          </p>
        </div>
      </div>

      {/* Depreciation Schedules by Asset */}
      <div className="space-y-6">
        {Object.entries(recordsByAsset).map(([assetId, assetRecords]) => {
          const asset = currentAssetValues.find(a => a.asset_id === assetId) || {};
          const totalDepreciation = assetRecords.reduce((sum, record) => sum + parseFloat(record.depreciation_amount as any), 0);
          
          return (
            <div key={`asset-schedule-${assetId}`} className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{asset.asset_name}</h3>
                    <p className="text-sm text-gray-500">{asset.asset_code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total Depreciation</p>
                    <p className="text-lg font-bold text-gray-900">${totalDepreciation.toLocaleString()}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Period
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Beginning Value
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Depreciation
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ending Value
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Accumulated
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Method
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {assetRecords.map((record, index) => (
                        <tr key={`record-${record.id || index}`}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(record.period_date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${parseFloat(record.beginning_value as any).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500 font-medium">
                            -${parseFloat(record.depreciation_amount as any).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${parseFloat(record.ending_value as any).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${parseFloat(record.accumulated_depreciation as any).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                            {record.depreciation_method?.replace('_', ' ') || 'straight line'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Asset Summary */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <p className="text-sm text-gray-500">Purchase Value</p>
                    <p className="text-sm font-medium text-gray-900">
                      ${parseFloat(asset.purchase_price || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Current Value</p>
                    <p className="text-sm font-medium text-gray-900">
                      ${parseFloat(asset.current_value || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Remaining Value</p>
                    <p className="text-sm font-medium text-gray-900">
                      ${parseFloat(asset.remaining_value || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Depreciation %</p>
                    <p className="text-sm font-medium text-gray-900">
                      {asset.purchase_price ? 
                        (((parseFloat(asset.purchase_price) - parseFloat(asset.current_value || 0)) / parseFloat(asset.purchase_price)) * 100).toFixed(1) 
                        : '0.0'}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {Object.keys(recordsByAsset).length === 0 && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-12 text-center">
              <div className="text-gray-400 text-4xl mb-4">📊</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Depreciation Data</h3>
              <p className="text-gray-500 mb-4">No depreciation records found for the selected filters.</p>
              <Link
                href="/dashboard/management/depreciation"
                className="text-blue-600 hover:text-blue-800"
              >
                Back to Depreciation Summary
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
