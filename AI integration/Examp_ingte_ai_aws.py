import torch
import cv2
import json
import numpy as np
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient

# Initialize AWS IoT MQTT Client
client = AWSIoTMQTTClient("BorderAI")
client.configureEndpoint("a2uf7icnenaaj0-ats.iot.ap-south-1.amazonaws.com", 8883)  # Replace with your AWS IoT endpoint

# Provide the correct path to AWS IoT certificate files
client.configureCredentials(
    "D:/project/AWS/Detector1/certf/AmazonRootCA1(1).pem",
    "D:/project/AWS/Detector1/certf/39d974dacbca5998e18ecc598dd1c45ce551b8a49b2f38b3a27f63b24f6a9354-private.pem.key",
    "D:/project/AWS/Detector1/certf/39d974dacbca5998e18ecc598dd1c45ce551b8a49b2f38b3a27f63b24f6a9354-certificate.pem.crt"
)

print("🔗 Connecting to AWS IoT...")
client.connect()
print("✅ Successfully connected to AWS IoT!")

# Function to send an alert
def send_alert(label):
    message = {"alert": f"{label} detected at border!"}
    client.publish("Detector2_alerts", json.dumps(message), 1)
    print(f"ALERT SENT: {label} detected!")

# Load YOLOv5 model (using local trained weights)
model = torch.hub.load('D:/project/yolov5', 'custom', path='yolov5s.pt', source='local')
model.eval()


# Start Video Capture
cap = cv2.VideoCapture(0)  # 0 for default webcam

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("❌ Failed to grab frame")
        break

    ## Run YOLOv5 inference
    results = model(frame)
    detections = results.pandas().xyxy[0]  # Convert results to Pandas DataFrame

    for _, row in detections.iterrows():
        label = row['name']
        conf = row['confidence']
        x1, y1, x2, y2 = int(row['xmin']), int(row['ymin']), int(row['xmax']), int(row['ymax'])

        # Draw bounding boxes
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(frame, f'{label} {conf:.2f}', (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Send alert if person or vehicle is detected
        if label in ["person", "car", "truck"]:
            send_alert(label)

    # Display video with bounding boxes
    cv2.imshow("YOLOv5 Live Detection", frame)

    # Exit on 'q' key press
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
