import sys
from awsglue.utils import getResolvedOptions
from pyspark.sql import SparkSession
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ['JOB_NAME', 'BRONZE_PATH', 'SILVER_PATH', 'GOLD_PATH'])

# Configure Spark for Iceberg BEFORE creating GlueContext
spark = SparkSession.builder \
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \
    .config("spark.sql.catalog.glue_catalog", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.glue_catalog.catalog-impl", "org.apache.iceberg.aws.glue.GlueCatalog") \
    .config("spark.sql.catalog.glue_catalog.io-impl", "org.apache.iceberg.aws.s3.S3FileIO") \
    .config("spark.sql.catalog.glue_catalog.silver", args['SILVER_PATH']) \
    .config("spark.sql.catalog.glue_catalog.gold", args['GOLD_PATH']) \
    .getOrCreate()

# ETL - Extract Transform Load
glueContext = GlueContext(spark.sparkContext)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# Extract
dynamic_frame = glueContext.create_dynamic_frame.from_options(
    connection_type="s3",
    connection_options={"paths": [args['BRONZE_PATH']]},
    format="csv",
    format_options={"withHeader": True}
)

# Transform
# TODO: implement this

# Load
if not dynamic_frame.toDF().rdd.isEmpty():
    glueContext.write_dynamic_frame.from_options(
        connection_type="s3",
        connection_options={"path": args['SILVER_PATH']},
        frame=dynamic_frame
    )

job.commit()
