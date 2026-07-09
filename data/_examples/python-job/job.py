import sys
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ['JOB_NAME', 'BRONZE_PATH', 'SILVER_PATH', 'GOLD_PATH'])

# ETL - Extract Transform Load
sc = SparkContext()
glueContext = GlueContext(sc)
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
glueContext.write_dynamic_frame.from_options(
    connection_type="s3",
    connection_options={"path": args['SILVER_PATH']},
    frame=dynamic_frame,
    format="iceberg"
)

job.commit()
