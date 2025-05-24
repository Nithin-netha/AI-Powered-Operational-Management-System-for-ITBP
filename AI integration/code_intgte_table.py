import torch
import boto3
import cv2
import numpy as np
import json
import uuid
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient
from datetime import datetime, timezone
import os
from decimal import Decimal
# Ensure AWS credentials are available
session = boto3.Session()
credentials = session.get_credentials()
if not credentials:
    raise Exception("AWS credentials not found. Configure them using the AWS CLI or environment variables.")

# AWS IoT MQTT Client
client = AWSIoTMQTTClient("BorderAI")
client.configureEndpoint("a2uf7icnenaaj0-ats.iot.ap-south-1.amazonaws.com", 8883)

# AWS IoT Certificate Paths
client.configureCredentials(
    "D:/project/AWS/Detector1/certf/AmazonRootCA1(1).pem",
    "D:/project/AWS/Detector1/certf/39d974dacbca5998e18ecc598dd1c45ce551b8a49b2f38b3a27f63b24f6a9354-private.pem.key",
    "D:/project/AWS/Detector1/certf/39d974dacbca5998e18ecc598dd1c45ce551b8a49b2f38b3a27f63b24f6a9354-certificate.pem.crt"
)

# Initialize AWS Services
dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
s3 = boto3.client('s3', region_name='ap-south-1')

table = dynamodb.Table("Detector2_alerts_table")
S3_BUCKET_NAME = "detector1-bucket"

print("🔗 Connecting to AWS IoT...")
client.connect()
print("✅ Successfully connected to AWS IoT!")

# Load YOLOv5 Model
model = torch.hub.load('D:/project/yolov5', 'custom', path='yolov5s.pt', source='local')
model.conf = 0.5

# Start video capture
cap = cv2.VideoCapture(0)

def upload_to_s3(image_path, s3_filename):
    """ Uploads the image to AWS S3 and returns the image URL """
    try:
        s3.upload_file(image_path, S3_BUCKET_NAME, s3_filename)
        image_url = f"https://{S3_BUCKET_NAME}.s3.ap-south-1.amazonaws.com/{s3_filename}"
        return image_url
    except Exception as e:
        print(f"❌ S3 Upload Failed: {e}")
        return None

def send_alert(lat, lon, object_type, image_path):
    """ Sends alert to AWS IoT and stores in DynamoDB """
    alert_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    # Upload Image to S3
    s3_filename = f"alerts/{alert_id}.jpeg"
    image_url = upload_to_s3(image_path, s3_filename)
    
    if not image_url:
        print("❌ Failed to upload image to S3. Alert not sent.")
        return

    # Alert Data
    alert_data = {
        "Alert_ID": alert_id,
        "timestamp": timestamp,
        "object_type": object_type,
        "latitude": float(lat),
        "longitude": float(lon),
        "camera_id": "Cam_01",
        "image_url": image_url,
        "alert_status": "New"
    }

    # Publish to MQTT topic (ensure JSON serialization)
    client.publish("Detector2_alerts", json.dumps(alert_data), 1)

    # Insert into DynamoDB (keep Decimal for compatibility)
    alert_data['latitude'] = Decimal(str(lat))  
    alert_data['longitude'] = Decimal(str(lon))
    table.put_item(Item=alert_data)

    print("✅ Alert Sent & Image Stored")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame)
    detections = results.pandas().xyxy[0]

    for _, row in detections.iterrows():
        label = row['name']
        conf = row['confidence']

        x1, y1, x2, y2 = int(row['xmin']), int(row['ymin']), int(row['xmax']), int(row['ymax'])

        # Draw bounding box
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(frame, f'{label} {conf:.2f}', (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        if label in ['person', 'car', 'truck']:  
            cropped_img = frame[y1:y2, x1:x2]  

            # Save Image Locally
            img_path = f"D:/project/yolov5/output_images/{uuid.uuid4()}.jpeg"
            cv2.imwrite(img_path, cropped_img)

            # Send Alert with Image
            send_alert(17.5987567, 78.4172736, label, img_path)

    cv2.imshow("Border AI", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
