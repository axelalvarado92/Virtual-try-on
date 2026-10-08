import os
import json
import uuid
import boto3
from botocore.config import Config

BUCKET = os.environ["BUCKET_NAME"]
BUCKET_REGION = os.environ["BUCKET_REGION"]

# Initialize the S3 client
s3 = boto3.client(
    "s3",
    region_name=BUCKET_REGION,
    config=Config(
        s3={
            "addressing_style": "path"
        }
    )
)

rekognition = boto3.client(
    "rekognition",
    region_name=BUCKET_REGION
)

def response(status_code, data=None, error=None):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({
            "data": data,
            "error": error
        }, default=str)
    }

def success(data):
    return response(200, data=data)

def create_session(event):
    body = json.loads(event["body"])
    extension = body["extension"]

    object_key = f"temporary/{uuid.uuid4()}.{extension}"

    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": object_key,
            "ContentType": body["content_type"]
        },
        ExpiresIn=300
    )

    return success({
        "upload_url": upload_url,
        "object_key": object_key,
        "region": BUCKET_REGION
    })

def analyze_selfie(event):

    print("ANALYZE VERSION 2")

    body = json.loads(event["body"])
    object_key = body["object_key"]

    s3_object = s3.get_object(
        Bucket=BUCKET,
        Key=object_key
    )

    image_bytes = s3_object["Body"].read()

    result = rekognition.detect_faces(
        Image={
            "Bytes": image_bytes
        },
        Attributes=["DEFAULT"]
    )

    face_details = result["FaceDetails"]

    if len(face_details) == 0:
        return response(
            400,
            error="No face detected"
        )
    
    if len(face_details) > 1:
        return response(
            400,
            error="Multiple faces detected"
        )
    
    face = face_details[0]
    
    face_width = face["BoundingBox"]["Width"]
    face_height = face["BoundingBox"]["Height"]
    
    if face_width < 0.25 or face_height < 0.25:
        return response(
            400,
            error="Face too small"
        )

    pose = face["Pose"]
    
    roll = pose["Roll"]
    yaw = pose["Yaw"]
    pitch = pose["Pitch"]

    if abs(roll) > 10:
        return response(
            400,
            error="Face too rotated"
        )
    
    if abs(yaw) > 15:
        return response(
            400,
            error="Face too turned"
        )
    
    if abs(pitch) > 15:
        return response(
            400,
            error="Face too tilted"
        )

    landmarks = face["Landmarks"]

    eye_left = next(
        landmark for landmark in landmarks
        if landmark["Type"] == "eyeLeft"
    )
    
    eye_right = next(
        landmark for landmark in landmarks
        if landmark["Type"] == "eyeRight"
    )

    sharpness = face["Quality"]["Sharpness"]
    
    if sharpness < 30:
        return response(
            400,
            error="Image too blurry"
        )
    
    return success({
        "status": "ready",
        "face": {
            "bounding_box": {
                "left": face["BoundingBox"]["Left"],
                "top": face["BoundingBox"]["Top"],
                "width": face["BoundingBox"]["Width"],
                "height": face["BoundingBox"]["Height"]
            },
            "pose": {
                "roll": roll,
                "yaw": yaw,
                "pitch": pitch
            },
            "quality": {
                "brightness": face["Quality"]["Brightness"],
                "sharpness": face["Quality"]["Sharpness"]
            },
            "landmarks": {
                "eye_left": {
                    "x": eye_left["X"],
                    "y": eye_left["Y"]
                },
                "eye_right": {
                    "x": eye_right["X"],
                    "y": eye_right["Y"]
                }
            }
        }
    })

def lambda_handler(event, context):

    route_key = event["routeKey"]

    if route_key == "POST /try-on/session":
        return create_session(event)

    if route_key == "POST /try-on/analyze":
        return analyze_selfie(event)

    return response(
        404,
        error="Route not supported"
    )