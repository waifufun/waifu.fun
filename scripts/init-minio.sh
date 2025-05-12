#!/bin/bash
until curl -sf http://localhost:9000/minio/health/live; do
    echo 'Waiting for MinIO to be ready...'
    sleep 1
done

mc alias set myminio http://localhost:9000 minio_user minio_password

mc mb myminio/autofun --ignore-existing

mc anonymous set public myminio/autofun
