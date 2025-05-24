import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Dashboard.css';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom marker icon for cameras
const cameraIcon = new L.Icon({
  iconUrl: '/camera-marker.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

interface Alert {
  Alert_ID: string;
  camera_id: string;
  object_type: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  image_url: string;
}

type DateFilter = 'all' | 'week' | 'month' | '3months' | '6months' | 'year' | '2years';

const Dashboard: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isCustomRange, setIsCustomRange] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<{ [key: string]: L.Marker }>({});

  // Initialize AWS clients
  const dynamoClient = new DynamoDBClient({
    region: process.env.REACT_APP_AWS_REGION,
    credentials: {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY!
    }
  });

  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  const s3Client = new S3Client({
    region: process.env.REACT_APP_AWS_REGION,
    credentials: {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY!
    }
  });

  useEffect(() => {
    fetchAlerts();
    // Set up periodic refresh (every 30 seconds)
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching alerts from DynamoDB...');
      // Query DynamoDB
      const command = new ScanCommand({
        TableName: 'Detector2_alerts_table'
      });

      console.log('Sending DynamoDB scan command...');
      const result = await docClient.send(command);
      console.log('DynamoDB response:', result);
      
      if (result.Items && result.Items.length > 0) {
        console.log(`Found ${result.Items.length} alerts`);
        const alertsWithSignedUrls = await Promise.all(
          result.Items.map(async (item: any) => {
            console.log('Processing item:', item);
            try {
              // Generate signed URL for the image
              const getObjectCommand = new GetObjectCommand({
                Bucket: 'detector1-bucket',
                Key: `alerts/${item.Alert_ID}.jpeg`
              });

              const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
                expiresIn: 3600 // URL expires in 1 hour
              });

              return {
                Alert_ID: item.Alert_ID,
                camera_id: item.camera_id,
                object_type: item.object_type,
                latitude: Number(item.latitude),
                longitude: Number(item.longitude),
                timestamp: item.timestamp,
                image_url: signedUrl
              };
            } catch (error) {
              console.error('Error processing item:', item, error);
              return null;
            }
          })
        );

        // Filter out any null results from failed processing
        const validAlerts = alertsWithSignedUrls.filter((alert): alert is Alert => alert !== null);

        // Sort alerts by timestamp (most recent first)
        const sortedAlerts = validAlerts.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        console.log('Processed alerts:', sortedAlerts);
        setAlerts(sortedAlerts);
      } else {
        console.log('No alerts found in DynamoDB');
        setError('No alerts found');
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
      setError('Failed to fetch alerts. Please check your AWS credentials and permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    filterAlerts();
  }, [alerts, dateFilter, startDate, endDate, isCustomRange]);

  const filterAlerts = () => {
    const now = new Date();
    const filtered = alerts.filter(alert => {
      const alertDate = new Date(alert.timestamp);
      
      if (isCustomRange && startDate && endDate) {
        // Set end date to end of the day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        return alertDate >= startDate && alertDate <= endOfDay;
      }

      switch (dateFilter) {
        case 'week':
          return now.getTime() - alertDate.getTime() <= 7 * 24 * 60 * 60 * 1000;
        case 'month':
          return now.getTime() - alertDate.getTime() <= 30 * 24 * 60 * 60 * 1000;
        case '3months':
          return now.getTime() - alertDate.getTime() <= 90 * 24 * 60 * 60 * 1000;
        case '6months':
          return now.getTime() - alertDate.getTime() <= 180 * 24 * 60 * 60 * 1000;
        case 'year':
          return now.getTime() - alertDate.getTime() <= 365 * 24 * 60 * 60 * 1000;
        case '2years':
          return now.getTime() - alertDate.getTime() <= 730 * 24 * 60 * 60 * 1000;
        default:
          return true;
      }
    });
    setFilteredAlerts(filtered);
  };

  const handleAlertClick = (alert: Alert) => {
    // Center and zoom map to the marker
    if (mapRef.current) {
      mapRef.current.setView([alert.latitude, alert.longitude], 15, {
        animate: true,
        duration: 1 // Animation duration in seconds
      });
    }

    // Open the popup for this marker
    const marker = markerRefs.current[alert.Alert_ID];
    if (marker) {
      marker.openPopup();
    }
  };

  // Add click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getFilterLabel = () => {
    if (isCustomRange && startDate && endDate) {
      return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    }

    switch (dateFilter) {
      case 'week': return 'Past week';
      case 'month': return 'Past month';
      case '3months': return 'Past 3 months';
      case '6months': return 'Past 6 months';
      case 'year': return 'Past year';
      case '2years': return 'Past 2 years';
      default: return 'All time';
    }
  };

  const handleCustomRangeSelect = () => {
    setIsCustomRange(true);
    setDateFilter('all');
    setIsFilterOpen(false);
  };

  const handlePresetSelect = (preset: DateFilter) => {
    setIsCustomRange(false);
    setDateFilter(preset);
    setStartDate(null);
    setEndDate(null);
    setIsFilterOpen(false);
  };

  return (
    <div className="dashboard">
      <div className="alerts-section">
        <div className="alerts-header">
          <h2>Recent Alerts</h2>
          <div className="filter-container" ref={filterRef}>
            <button 
              className="filter-dropdown-btn"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <span>{getFilterLabel()}</span>
              <svg 
                className={`dropdown-arrow ${isFilterOpen ? 'open' : ''}`}
                width="10" 
                height="6" 
                viewBox="0 0 10 6" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {isFilterOpen && (
              <div className="filter-dropdown-content">
                <div onClick={handleCustomRangeSelect} className="custom-range-option">
                  Custom Range
                </div>
                {isCustomRange && (
                  <div className="date-range-picker">
                    <div className="date-picker-container">
                      <div className="date-inputs">
                        <DatePicker
                          selected={startDate}
                          onChange={(date: Date | null) => setStartDate(date)}
                          selectsStart
                          startDate={startDate}
                          endDate={endDate}
                          maxDate={new Date()}
                          placeholderText="Start Date"
                          className="date-picker-input"
                          dateFormat="yyyy-MM-dd"
                          showMonthDropdown
                          showYearDropdown
                          dropdownMode="select"
                        />
                        <DatePicker
                          selected={endDate}
                          onChange={(date: Date | null) => setEndDate(date)}
                          selectsEnd
                          startDate={startDate}
                          endDate={endDate}
                          minDate={startDate || undefined}
                          maxDate={new Date()}
                          placeholderText="End Date"
                          className="date-picker-input"
                          dateFormat="yyyy-MM-dd"
                          showMonthDropdown
                          showYearDropdown
                          dropdownMode="select"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="date-range-divider"></div>
                <div onClick={() => handlePresetSelect('week')}>Past week</div>
                <div onClick={() => handlePresetSelect('month')}>Past month</div>
                <div onClick={() => handlePresetSelect('3months')}>Past 3 months</div>
                <div onClick={() => handlePresetSelect('6months')}>Past 6 months</div>
                <div onClick={() => handlePresetSelect('year')}>Past year</div>
                <div onClick={() => handlePresetSelect('2years')}>Past 2 years</div>
                <div onClick={() => handlePresetSelect('all')}>All time</div>
              </div>
            )}
          </div>
        </div>
        {loading && <div className="loading">Loading alerts...</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !error && (
          <table className="alerts-table">
            <thead>
              <tr>
                <th>Alert ID</th>
                <th>Camera ID</th>
                <th>Object</th>
                <th>Lat</th>
                <th>Long</th>
                <th>Time</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((alert) => (
                <tr 
                  key={alert.Alert_ID}
                  onClick={() => handleAlertClick(alert)}
                  className="alert-row"
                >
                  <td>{alert.Alert_ID}</td>
                  <td>{alert.camera_id}</td>
                  <td>{alert.object_type}</td>
                  <td>{alert.latitude}</td>
                  <td>{alert.longitude}</td>
                  <td>{new Date(alert.timestamp).toLocaleString()}</td>
                  <td>
                    <img 
                      src={alert.image_url} 
                      alt="Alert" 
                      className="alert-thumbnail"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="map-section">
        <h2>Camera Locations</h2>
        <MapContainer
          center={[17.5987567, 78.4172736]}
          zoom={8}
          style={{ height: '550px', width: '100%' }}
          className="map-container"
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {filteredAlerts.map((alert) => (
            <Marker
              key={alert.Alert_ID}
              position={[alert.latitude, alert.longitude]}
              icon={cameraIcon}
              ref={(ref) => {
                if (ref) {
                  markerRefs.current[alert.Alert_ID] = ref;
                }
              }}
            >
              <Popup className="custom-popup">
                <div className="map-popup">
                  <h3>Alert Details</h3>
                  <div className="popup-image-container">
                    <img 
                      src={alert.image_url} 
                      alt="Alert" 
                      className="popup-image"
                    />
                  </div>
                  <div className="popup-details">
                    <p><strong>Alert ID:</strong> {alert.Alert_ID}</p>
                    <p><strong>Camera ID:</strong> {alert.camera_id}</p>
                    <p><strong>Object Type:</strong> {alert.object_type}</p>
                    <p><strong>Location:</strong> {alert.latitude}, {alert.longitude}</p>
                    <p><strong>Time:</strong> {new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default Dashboard; 